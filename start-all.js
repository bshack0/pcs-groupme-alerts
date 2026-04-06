const { startCron } = require('./index');
const { startUiServer } = require('./ui.server');

function startAll() {
  startCron();
  startUiServer();
  console.log('Bot scheduler + Admin UI are running in one process.');
}

if (require.main === module) {
  startAll();
}

module.exports = { startAll };
