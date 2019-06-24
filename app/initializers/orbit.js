import fetch from 'fetch';
import { Schema, KeyMap } from '@orbit/data';
import MemorySource from '@orbit/memory';
import JSONAPISource, { JSONAPISerializer } from '@orbit/jsonapi';
import IndexedDBSource from '@orbit/indexeddb';
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
    let schemaJson;
    if (localStorage.getItem('schema')) {
      schemaJson = JSON.parse(localStorage.getItem('schema'));
    } else {
      schemaJson = await fetch(`${HOST}/schema`).then(response =>
        response.json()
      );
      localStorage.setItem('schema', JSON.stringify(schemaJson));
    }

    const schema = new Schema({ models: schemaJson.models });
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
    const backup = new IndexedDBSource({
      name: 'backup',
      keyMap,
      schema
    });

    const coordinator = new Coordinator({
      sources: [memory, remote, backup],
      strategies: [
        new EventLoggingStrategy(),
        new LogTruncationStrategy(),
        ...remoteStrategies(),
        ...backupStrategies()
      ]
    });

    application.register('service:schema', schema, { instantiate: false });
    application.register('service:source', memory, { instantiate: false });
    application.register('service:coordinator', coordinator, {
      instantiate: false
    });

    const transform = await backup.pull(q => q.findRecords());

    await memory.sync(transform);

    await coordinator.activate();

    application.advanceReadiness();
  })();
}

function backupStrategies() {
  return [
    new SyncStrategy({
      source: 'memory',
      target: 'backup',
      blocking: true
    })
  ];
}

function remoteStrategies(enabled = true) {
  if (!enabled) {
    return [];
  }
  return [
    // Query the remote server whenever the memory is queried
    new RequestStrategy({
      source: 'memory',
      on: 'beforeQuery',

      target: 'remote',
      action: 'pull',

      blocking: true,

      filter(query) {
        const { expression, options } = query;
        const isFindRecord = query.expression.op === 'findRecord';
        if (options && options.reload) {
          return true;
        }
        const result = this.source.cache.query(query);
        if (isFindRecord && !result) {
          return true;
        }
        return !isCachedQuery(this.source, expression);
      },

      catch(e) {
        this.source.requestQueue.skip();
        this.target.requestQueue.skip();
        throw e;
      }
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

function isCachedQuery(source, expression) {
  const key = JSON.stringify(expression);
  const cache = queryExpressionsLoaded.get(source) || {};

  if (!cache[key]) {
    cache[key] = true;
    queryExpressionsLoaded.set(source, cache);
    return false;
  }
  return true;
}

const queryExpressionsLoaded = new WeakMap();
