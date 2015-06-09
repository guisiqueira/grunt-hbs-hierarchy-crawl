var footerGlobal = (function () {
  'use strict';

  function logs () {
    console.log('footer loaded');
  }

  return {
    log: logs
  };
})();

footerGlobal.log();
