'use strict';

// Loaded only by the Android bundle, after the shared backup functions.
{
  let saving = false;
  window.exportBlob = async (content, filename) => {
    if (saving) return false;
    saving = true;
    try {
      const result = await window.Capacitor.Plugins.BackupExport.save({ content, filename });
      if (result.saved) toast('Backup saved.');
      return result.saved === true;
    } catch {
      toast('Could not save the backup. Try again.');
      return false;
    } finally {
      saving = false;
    }
  };
}
