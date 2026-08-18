#!/usr/bin/env node
/**
 * One-time telephony bootstrap:
 *   - Ensure Twilio Elastic SIP trunk + LiveKit origination URI
 *   - Ensure LiveKit inbound SIP trunk + dispatch rule
 *   - Persist resulting IDs into .env
 *
 * Usage:
 *   node scripts/setup-telephony.mjs --livekit-number=+15551234567
 *   node scripts/setup-telephony.mjs --env=.env.local --skip-twilio
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Twilio from 'twilio';
import { SipClient } from 'livekit-server-sdk';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const args = parseArgs(process.argv.slice(2));
const envPath = resolve(ROOT, args.env ?? '.env');
const envFromFile = parseEnvFile(envPath);
const read = (key) => process.env[key] ?? envFromFile[key] ?? '';

const options = {
  envPath,
  skipTwilio: args['skip-twilio'] === 'true',
  skipLivekit: args['skip-livekit'] === 'true',
  livekitNumber: args['livekit-number'] ?? '',
  twilioTrunkName: args['twilio-trunk-name'] ?? 'OdysseusAI SIP Trunk',
  livekitTrunkName: args['livekit-trunk-name'] ?? 'OdysseusAI Inbound Trunk',
  dispatchName: args['dispatch-name'] ?? 'OdysseusAI Inbound Dispatch',
  roomPrefix: args['room-prefix'] ?? 'call-',
  dryRun: args['dry-run'] === 'true',
};

const state = {
  twilioTrunkSid: read('TWILIO_TRUNK_SID').trim(),
  livekitSipEnabled: read('LIVEKIT_SIP_ENABLED').trim(),
  livekitTrunkId: read('LIVEKIT_SIP_TRUNK_ID').trim(),
  livekitDispatchRuleId: read('LIVEKIT_SIP_DISPATCH_RULE_ID').trim(),
};

try {
  await main();
} catch (error) {
  console.error(`\nSetup failed: ${safeErrorMessage(error)}`);
  process.exit(1);
}

async function main() {
  const livekitUrl = read('LIVEKIT_URL').trim();
  const livekitApiKey = read('LIVEKIT_API_KEY').trim();
  const livekitApiSecret = read('LIVEKIT_API_SECRET').trim();
  const needsLivekitUrl = !options.skipTwilio || !options.skipLivekit;
  if (needsLivekitUrl && !livekitUrl) {
    throw new Error('LIVEKIT_URL is required');
  }

  const projectSubdomain = livekitUrl
    ? parseLivekitHost(livekitUrl).split('.')[0]
    : '';
  if (!options.skipTwilio && !projectSubdomain) {
    throw new Error(
      `Could not derive LiveKit project subdomain from LIVEKIT_URL (${livekitUrl})`,
    );
  }

  if (!options.skipTwilio) {
    const twilioAccountSid = mustRead('TWILIO_ACCOUNT_SID', read);
    const twilioAuthToken = mustRead('TWILIO_AUTH_TOKEN', read);
    await setupTwilio({
      twilioAccountSid,
      twilioAuthToken,
      projectSubdomain,
    });
  } else {
    console.log('Skipping Twilio setup (--skip-twilio=true)');
  }

  if (!options.skipLivekit) {
    if (!livekitApiKey || !livekitApiSecret) {
      throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
    }
    await setupLivekit({
      livekitUrl,
      livekitApiKey,
      livekitApiSecret,
      number: options.livekitNumber,
    });
  } else {
    console.log('Skipping LiveKit SIP setup (--skip-livekit=true)');
  }

  if (state.livekitTrunkId && state.livekitDispatchRuleId) {
    state.livekitSipEnabled = 'true';
  }
  persistEnv();
  printSummary(projectSubdomain || '(unknown)');
}

async function setupTwilio({
  twilioAccountSid,
  twilioAuthToken,
  projectSubdomain,
}) {
  const client = Twilio(twilioAccountSid, twilioAuthToken);
  let trunkSid = state.twilioTrunkSid;

  if (trunkSid) {
    const exists = await twilioTrunkExists(client, trunkSid);
    if (!exists) {
      console.log(`Twilio trunk ${trunkSid} not found. Creating a new trunk.`);
      trunkSid = '';
    } else {
      console.log(`Using existing Twilio trunk: ${trunkSid}`);
    }
  }

  if (!trunkSid) {
    if (options.dryRun) {
      trunkSid = '<DRY_RUN_TWILIO_TRUNK_SID>';
      console.log(`[dry-run] Would create Twilio trunk "${options.twilioTrunkName}"`);
    } else {
      const trunk = await client.trunking.v1.trunks.create({
        friendlyName: options.twilioTrunkName,
      });
      trunkSid = trunk.sid;
      console.log(`Created Twilio trunk: ${trunkSid}`);
    }
  }

  const sipUrl = `sip:${projectSubdomain}.sip.livekit.cloud;transport=tcp`;
  if (!options.dryRun) {
    await ensureTwilioOriginationUrl(client, trunkSid, sipUrl);
  } else {
    console.log(`[dry-run] Would ensure Twilio origination URI: ${sipUrl}`);
  }

  state.twilioTrunkSid = trunkSid;
}

async function setupLivekit({ livekitUrl, livekitApiKey, livekitApiSecret, number }) {
  const sip = new SipClient(livekitUrl, livekitApiKey, livekitApiSecret);
  let trunkId = state.livekitTrunkId;

  if (trunkId) {
    const existing = await getInboundTrunkById(sip, trunkId);
    if (!existing) {
      console.log(`LiveKit trunk ${trunkId} not found. Creating a new inbound trunk.`);
      trunkId = '';
    } else {
      console.log(`Using existing LiveKit inbound trunk: ${trunkId}`);
    }
  }

  if (!trunkId) {
    const chosenNumber = number.trim();
    if (!chosenNumber) {
      throw new Error(
        'LIVEKIT_SIP_TRUNK_ID is missing and no number was provided. Pass --livekit-number=+E164 so a new inbound trunk can be created.',
      );
    }
    ensureE164(chosenNumber, '--livekit-number');

    if (options.dryRun) {
      trunkId = '<DRY_RUN_LIVEKIT_TRUNK_ID>';
      console.log(
        `[dry-run] Would create LiveKit inbound trunk "${options.livekitTrunkName}" with number ${chosenNumber}`,
      );
    } else {
      const trunk = await sip.createSipInboundTrunk(options.livekitTrunkName, [
        chosenNumber,
      ]);
      trunkId = extractId(trunk, ['sipTrunkId', 'trunkId', 'sip_trunk_id']);
      if (!trunkId) {
        throw new Error('LiveKit trunk created, but trunk ID was missing in response');
      }
      console.log(`Created LiveKit inbound trunk: ${trunkId}`);
    }
  }

  let dispatchRuleId = state.livekitDispatchRuleId;
  if (dispatchRuleId) {
    const existingRule = await getDispatchRuleById(sip, dispatchRuleId);
    if (!existingRule) {
      console.log(
        `LiveKit dispatch rule ${dispatchRuleId} not found. Creating a new dispatch rule.`,
      );
      dispatchRuleId = '';
    } else {
      console.log(`Using existing LiveKit dispatch rule: ${dispatchRuleId}`);
    }
  }

  if (!dispatchRuleId) {
    if (options.dryRun) {
      dispatchRuleId = '<DRY_RUN_LIVEKIT_DISPATCH_RULE_ID>';
      console.log(
        `[dry-run] Would create dispatch rule "${options.dispatchName}" with room prefix "${options.roomPrefix}"`,
      );
    } else {
      const rule = await sip.createSipDispatchRule(
        { type: 'individual', roomPrefix: options.roomPrefix },
        { name: options.dispatchName, trunkIds: [trunkId] },
      );
      dispatchRuleId = extractId(rule, [
        'sipDispatchRuleId',
        'dispatchRuleId',
        'sip_dispatch_rule_id',
      ]);
      if (!dispatchRuleId) {
        throw new Error(
          'LiveKit dispatch rule created, but dispatch rule ID was missing in response',
        );
      }
      console.log(`Created LiveKit dispatch rule: ${dispatchRuleId}`);
    }
  }

  state.livekitTrunkId = trunkId;
  state.livekitDispatchRuleId = dispatchRuleId;
}

async function twilioTrunkExists(client, trunkSid) {
  try {
    await client.trunking.v1.trunks(trunkSid).fetch();
    return true;
  } catch {
    return false;
  }
}

async function ensureTwilioOriginationUrl(client, trunkSid, sipUrl) {
  const urls = await client.trunking.v1.trunks(trunkSid).originationUrls.list({
    limit: 50,
  });
  const exists = urls.some(
    (item) => normalizeSipUrl(item.sipUrl) === normalizeSipUrl(sipUrl),
  );
  if (exists) {
    console.log(`Twilio origination URI already exists on trunk: ${sipUrl}`);
    return;
  }

  await client.trunking.v1.trunks(trunkSid).originationUrls.create({
    enabled: true,
    friendlyName: 'LiveKit origination',
    priority: 1,
    weight: 1,
    sipUrl,
  });
  console.log(`Added Twilio origination URI: ${sipUrl}`);
}

function normalizeSipUrl(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function getInboundTrunkById(sip, trunkId) {
  try {
    const trunks = await sip.listSipInboundTrunk({ trunkIds: [trunkId] });
    return trunks[0] ?? null;
  } catch {
    return null;
  }
}

async function getDispatchRuleById(sip, dispatchRuleId) {
  try {
    const rules = await sip.listSipDispatchRule({ dispatchRuleIds: [dispatchRuleId] });
    return rules[0] ?? null;
  } catch {
    return null;
  }
}

function mustRead(key, reader) {
  const value = reader(key).trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function ensureE164(number, argName) {
  if (!/^\+[1-9]\d{6,14}$/.test(number)) {
    throw new Error(`${argName} must be E.164 format, e.g. +15551234567`);
  }
}

function parseLivekitHost(livekitUrl) {
  const normalized = livekitUrl.replace(/^wss?:\/\//i, 'https://');
  const parsed = new URL(normalized);
  return parsed.host;
}

function persistEnv() {
  const patch = {
    TWILIO_TRUNK_SID: state.twilioTrunkSid,
    LIVEKIT_SIP_ENABLED: state.livekitSipEnabled || 'true',
    LIVEKIT_SIP_TRUNK_ID: state.livekitTrunkId,
    LIVEKIT_SIP_DISPATCH_RULE_ID: state.livekitDispatchRuleId,
  };
  if (options.dryRun) {
    console.log(`[dry-run] Would update ${options.envPath} with:`);
    for (const [key, value] of Object.entries(patch)) {
      console.log(`  ${key}=${value}`);
    }
    return;
  }

  const updated = updateEnvText(readFileOrEmpty(options.envPath), patch);
  writeFileSync(options.envPath, updated, 'utf8');
  console.log(`Updated ${options.envPath}`);
}

function printSummary(projectSubdomain) {
  const sipUri = `sip:${projectSubdomain}.sip.livekit.cloud;transport=tcp`;
  console.log('\nTelephony setup complete.');
  console.log(`- TWILIO_TRUNK_SID=${state.twilioTrunkSid}`);
  console.log(`- LIVEKIT_SIP_TRUNK_ID=${state.livekitTrunkId}`);
  console.log(`- LIVEKIT_SIP_DISPATCH_RULE_ID=${state.livekitDispatchRuleId}`);
  console.log(`- LIVEKIT_SIP_ENABLED=true`);
  console.log(`- Twilio origination URI: ${sipUri}`);
}

function readFileOrEmpty(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function updateEnvText(currentText, updates) {
  const lines = currentText ? currentText.split('\n') : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    if (!line || line.trim().startsWith('#')) return line;
    const eq = line.indexOf('=');
    if (eq === -1) return line;
    const key = line.slice(0, eq).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }

  return `${nextLines.join('\n').replace(/\n*$/, '\n')}`;
}

function parseEnvFile(path) {
  const raw = readFileOrEmpty(path);
  if (!raw) return {};
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const cleaned = token.slice(2);
    const eq = cleaned.indexOf('=');
    if (eq === -1) {
      out[cleaned] = 'true';
    } else {
      out[cleaned.slice(0, eq)] = cleaned.slice(eq + 1);
    }
  }
  return out;
}

function extractId(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
