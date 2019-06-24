import fetch from 'fetch';
import { Schema, KeyMap } from '@orbit/data';
import MemorySource from '@orbit/memory';
import JSONAPISource, { JSONAPISerializer } from '@orbit/jsonapi';
import Coordinator, {
  RequestStrategy,
  SyncStrategy,
  EventLoggingStrategy,
  LogTruncationStrategy
} from '@orbit/coordinator';

export function initialize(application) {
  application.deferReadiness();

  const HOST = 'https://realworld-orbit-api.herokuapp.com';
  const READ_ONLY_ATTRIBUTES = ['createdAt', 'updatedAt'];

  class Serializer extends JSONAPISerializer {
    resourceKey() {
      return 'remoteId';
    }

    serializeAttribute(resource, record, attr, model) {
      if (!READ_ONLY_ATTRIBUTES.includes(attr)) {
        super.serializeAttribute(resource, record, attr, model);
      }
    }
  }

  (async () => {
    const { models } = await fetch(`${HOST}/schema`).then(response =>
      response.json()
    );

    const schema = new Schema({ models });
    const keyMap = new KeyMap();

    const memory = new MemorySource({
      name: 'memory',
      keyMap,
      schema
    });
    const remote = new JSONAPISource({
      name: 'remote',
      keyMap,
      schema,
      SerializerClass: Serializer,
      host: HOST
    });

    const coordinator = new Coordinator({
      sources: [memory, remote],
      strategies: [
        new EventLoggingStrategy(),
        new LogTruncationStrategy(),
        ...remoteStrategies()
      ]
    });

    await coordinator.activate();

    application.register('service:schema', schema, { instantiate: false });
    application.register('service:source', memory, { instantiate: false });

    application.advanceReadiness();
  })();
}

function remoteStrategies() {
  return [
    // Query the remote server whenever the memory is queried
    new RequestStrategy({
      source: 'memory',
      on: 'beforeQuery',

      target: 'remote',
      action: 'pull',

      blocking: true
    }),
    // Update the remote server whenever the memory is updated
    new RequestStrategy({
      source: 'memory',
      on: 'beforeUpdate',

      target: 'remote',
      action: 'push',

      blocking: true
    }),
    // Sync all changes received from the remote server to the memory
    new SyncStrategy({
      source: 'remote',
      target: 'memory',

      blocking: true
    })
  ];
}

export default {
  initialize
};
