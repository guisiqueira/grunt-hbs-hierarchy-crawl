var homeModule = (function () {
  'use strict';

  if (Modernizr.geolocation) {
    console.log('geo');
  } else {
    console.log('no geo');
  }

  function logs () {
    console.log('home loaded');
  }

  return {
    log: logs
  };
})();

homeModule.log();
