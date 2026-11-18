'use strict';

const endpoint = 'https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitdex-download';
const version = document.getElementById('version');
const published = document.getElementById('published');
const publishDate = document.getElementById('publish-date');
const notice = document.getElementById('notice');
const download = document.getElementById('download');
const instructions = document.getElementById('instructions');

function showNotice(status, message) {
  version.textContent = status;
  notice.textContent = message;
  notice.hidden = false;
}

async function loadRelease() {
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (!key) {
    showNotice('Download link required', 'Open your full FitnessDex updates bookmark to access the APK.');
    return;
  }

  const url = new URL(endpoint);
  url.searchParams.set('key', key);
  download.href = url.href;
  download.hidden = false;
  instructions.hidden = false;

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) {
      download.hidden = true;
      instructions.hidden = true;
      showNotice('Download link unavailable', 'Check that you opened the full FitnessDex updates bookmark.');
      return;
    }
    if (!response.ok) throw new Error('Release request failed');

    const filename = response.headers.get('Content-Disposition') || '';
    const release = filename.match(/filename="FitnessDex-Android-v(\d+\.\d+\.\d+)\.apk"/i);
    if (!release) throw new Error('Missing version');

    version.textContent = 'v' + release[1];
    const date = new Date(response.headers.get('Last-Modified') || '');
    if (Number.isFinite(date.getTime())) {
      publishDate.dateTime = date.toISOString();
      publishDate.textContent = new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/London'
      }).format(date);
      published.hidden = false;
    }
  } catch {
    showNotice('Version unavailable', 'The version check failed. You can still try downloading the APK.');
  }
}

loadRelease();
