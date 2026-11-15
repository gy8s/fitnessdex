'use strict';

const assert = require('node:assert/strict');

const screens = [
  { name:'home', tab:'home', heading:'Make today count.' },
  { name:'log', tab:'log', heading:'What did you do?' },
  { name:'dex', tab:'dex', heading:'ExerciseDex' },
  { name:'more', tab:'more', heading:'More' },
  { name:'history', tab:'more', option:'History & data', heading:'History & data' },
  { name:'care', tab:'more', option:'Daily care', heading:'Small habits, every day' }
];

function inspectScreen(screen) {
  const app = document.querySelector('#app');
  const nav = document.querySelector('nav.nav');
  if (!app?.textContent.trim() || !nav) return null;
  nav.querySelector('button[data-tab="' + screen.tab + '"]')?.click();
  if (screen.option) {
    [...app.querySelectorAll('button.fd-option')].find(button =>
      button.querySelector('strong')?.textContent.trim() === screen.option)?.click();
  }
  const header = document.querySelector('body > header').getBoundingClientRect();
  const tabs = [...nav.querySelectorAll('button')];
  const allTabsReachable = tabs.every(button => {
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth + 1 &&
      rect.top >= 0 && rect.bottom <= innerHeight + 1 &&
      button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  });
  return {
    heading: app.querySelector('h1, h2')?.textContent.trim(),
    controls: [...app.querySelectorAll('button')].filter(button => button.offsetHeight > 0).length,
    tabs: tabs.map(button => button.textContent.trim()),
    allTabsReachable,
    headerVisible: header.top >= 0 && header.bottom <= innerHeight,
    fitsWidth: document.documentElement.scrollWidth <= innerWidth + 1,
    width: innerWidth,
    height: innerHeight
  };
}

function verifyScreen(screen, state) {
  assert(state, screen.name + ' did not render');
  assert(state.heading?.startsWith(screen.heading), JSON.stringify({ screen:screen.name, state }));
  assert.deepEqual(state.tabs, ['Home', 'Log', 'ExerciseDex', 'More']);
  assert(state.controls > 0, screen.name + ' has no usable controls');
  assert(state.allTabsReachable, screen.name + ' has obstructed navigation');
  assert(state.headerVisible, screen.name + ' header is outside the viewport');
  assert(state.fitsWidth, screen.name + ' overflows at ' + state.width + 'px');
}

module.exports = { screens, inspectScreen, verifyScreen };
