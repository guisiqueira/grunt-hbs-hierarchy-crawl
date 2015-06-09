var headerGlobal = (function () {
  'use strict';

  function logs () {
    console.log('header loaded');
  }

  return {
    log: logs,
  };
})();

headerGlobal.log();
