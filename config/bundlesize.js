'use strict';

module.exports = {
  app: {
    javascript: {
      pattern: ['assets/*.js'],
      limit: '200KB',
      compression: 'gzip'
    },
    'javascript [brotli]': {
      pattern: ['assets/*.js'],
      limit: '170KB',
      compression: 'brotli'
    },
    css: {
      pattern: 'assets/*.css',
      limit: '58KB',
      compression: 'gzip'
    }
  }
};
