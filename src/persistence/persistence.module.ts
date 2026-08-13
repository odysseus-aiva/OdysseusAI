import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AGENT_REPOSITORY } from '../agents/interfaces/agent-repository.interface';
import { InMemoryAgentRepository } from '../agents/repositories/in-memory-agent.repository';
import { CALL_LOGS_REPOSITORY } from '../call-logs/interfaces/call-logs-repository.interface';
import { InMemoryCallLogsRepository } from '../call-logs/repositories/in-memory-call-logs.repository';
import { CONVERSATION_STATE_REPOSITORY } from '../orchestration/interfaces/conversation-state-repository.interface';
import { InMemoryConversationStateRepository } from '../orchestration/repositories/in-memory-conversation-state.repository';
import { isMongoPersistence } from './persistence.config';
import { MongoAgentRepository } from './mongo/mongo-agent.repository';
import { MongoCallLogsRepository } from './mongo/mongo-call-logs.repository';
import { MongoConversationStateRepository } from './mongo/mongo-conversation-state.repository';
import { AgentEntity, AgentSchema } from './mongo/schemas/agent.schema';
import {
  AgentToolEntity,
  AgentToolSchema,
} from './mongo/schemas/agent-tool.schema';
import { CallEntity, CallSchema } from './mongo/schemas/call.schema';
import {
  CallEventEntity,
  CallEventSchema,
} from './mongo/schemas/call-event.schema';
import {
  ConversationEntity,
  ConversationSchema,
} from './mongo/schemas/conversation.schema';

/**
 * Configuration-driven persistence.
 *
 * Set PERSISTENCE_PROVIDER=mongodb and MONGODB_URI to use any MongoDB deployment.
 * No code changes required when switching connection strings or hosts.
 */
@Global()
@Module({})
export class PersistenceModule {
  static forRoot(): DynamicModule {
    if (isMongoPersistence()) {
      return {
        module: PersistenceModule,
        imports: [
          MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => {
              const uri = config.get<string>('persistence.mongodb.uri')?.trim();
              if (!uri) {
                throw new Error(
                  'PERSISTENCE_PROVIDER=mongodb requires MONGODB_URI to be set',
                );
              }

              const dbName = config
                .get<string>('persistence.mongodb.dbName')
                ?.trim();

              return {
                uri,
                ...(dbName ? { dbName } : {}),
              };
            },
            inject: [ConfigService],
          }),
          MongooseModule.forFeature([
            { name: CallEntity.name, schema: CallSchema },
            { name: CallEventEntity.name, schema: CallEventSchema },
            { name: ConversationEntity.name, schema: ConversationSchema },
            { name: AgentEntity.name, schema: AgentSchema },
            { name: AgentToolEntity.name, schema: AgentToolSchema },
          ]),
        ],
        providers: [
          MongoCallLogsRepository,
          MongoConversationStateRepository,
          MongoAgentRepository,
          {
            provide: CALL_LOGS_REPOSITORY,
            useExisting: MongoCallLogsRepository,
          },
          {
            provide: CONVERSATION_STATE_REPOSITORY,
            useExisting: MongoConversationStateRepository,
          },
          {
            provide: AGENT_REPOSITORY,
            useExisting: MongoAgentRepository,
          },
        ],
        exports: [
          CALL_LOGS_REPOSITORY,
          CONVERSATION_STATE_REPOSITORY,
          AGENT_REPOSITORY,
        ],
      };
    }

    return {
      module: PersistenceModule,
      providers: [
        InMemoryCallLogsRepository,
        InMemoryConversationStateRepository,
        InMemoryAgentRepository,
        {
          provide: CALL_LOGS_REPOSITORY,
          useExisting: InMemoryCallLogsRepository,
        },
        {
          provide: CONVERSATION_STATE_REPOSITORY,
          useExisting: InMemoryConversationStateRepository,
        },
        {
          provide: AGENT_REPOSITORY,
          useExisting: InMemoryAgentRepository,
        },
      ],
      exports: [
        CALL_LOGS_REPOSITORY,
        CONVERSATION_STATE_REPOSITORY,
        AGENT_REPOSITORY,
      ],
    };
  }
}
