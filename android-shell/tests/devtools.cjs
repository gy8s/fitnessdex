'use strict';

async function command(webSocketUrl, method, params = {}) {
  const socket = new WebSocket(webSocketUrl);
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error(method + ' timed out')), 10000);
      socket.addEventListener('error', () => reject(Error('Could not connect to DevTools')), { once: true });
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        const error = message.error || message.result?.exceptionDetails;
        if (error) reject(Error(JSON.stringify(error)));
        else resolve(message.result);
      });
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id:1, method, params })), { once: true });
    });
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

async function inspect(target, expression, userGesture = false) {
  const response = await command(target.webSocketDebuggerUrl, 'Runtime.evaluate',
    { expression, returnByValue:true, awaitPromise:true, userGesture });
  return response?.result?.value;
}

module.exports = { command, inspect };
