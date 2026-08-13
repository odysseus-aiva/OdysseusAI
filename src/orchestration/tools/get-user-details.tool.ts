import { Injectable, Logger } from '@nestjs/common';
import { AgentTool } from '../interfaces/agent-tool.interface';
import { ToolExecutionContext } from '../interfaces/tool-execution-context.interface';

export interface UserDetailsOutput {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  email: string;
  phone: string;
  username: string;
}

/**
 * Example tool: fetches a dummy user from DummyJSON.
 * Future tools should follow the same AgentTool pattern and register in OrchestrationModule.
 */
@Injectable()
export class GetUserDetailsTool
  implements AgentTool<Record<string, never>, UserDetailsOutput>
{
  readonly name = 'get_user_details';
  readonly description =
    'Fetch user details when the caller asks for their user details, account info, or profile.';
  readonly schema: Record<string, unknown> = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  private readonly logger = new Logger(GetUserDetailsTool.name);

  async execute(
    _input: Record<string, never>,
    context: ToolExecutionContext,
  ): Promise<UserDetailsOutput> {
    this.logger.log(
      `[${context.callId}] Fetching user details from dummyjson`,
    );

    const response = await fetch('https://dummyjson.com/users/1');
    if (!response.ok) {
      throw new Error(
        `DummyJSON user lookup failed (${response.status})`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      id: Number(data.id),
      firstName: String(data.firstName ?? ''),
      lastName: String(data.lastName ?? ''),
      age: Number(data.age ?? 0),
      email: String(data.email ?? ''),
      phone: String(data.phone ?? ''),
      username: String(data.username ?? ''),
    };
  }
}
