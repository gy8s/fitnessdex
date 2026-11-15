package io.github.gy8s.fitnessdex;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupExport")
public class BackupExportPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "");
        String content = call.getString("content");
        if (!filename.matches("FitnessDex_[A-Za-z0-9_-]+\\.json") || content == null) {
            call.reject("Invalid backup filename or contents");
            return;
        }

        File staged = null;
        try {
            staged = File.createTempFile("fd-backup-", ".json", getContext().getCacheDir());
            try (FileOutputStream output = new FileOutputStream(staged)) {
                output.write(content.getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            if (staged != null) staged.delete();
            call.reject("Could not prepare the backup");
            return;
        }

        // Capacitor saves call options in Android activity state. Keep only a cache filename there.
        call.getData().remove("content");
        call.getData().put("staged", staged.getName());
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri(
            "com.android.externalstorage.documents", "primary:Download"
        ));
        File pending = staged;
        getActivity().runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, "finishSave");
            } catch (RuntimeException e) {
                pending.delete();
                call.reject("Android could not open the Save dialog");
            }
        });
    }

    @ActivityCallback
    private void finishSave(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String name = call.getString("staged", "");
        if (!name.matches("fd-backup--?[0-9]+\\.json")) {
            call.reject("The pending backup is unavailable");
            return;
        }
        File staged = new File(getContext().getCacheDir(), name);
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK) {
            staged.delete();
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }

        Uri destination = data == null ? null : data.getData();
        execute(() -> writeBackup(call, staged, destination));
    }

    private void writeBackup(PluginCall call, File staged, Uri destination) {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            if (destination == null) throw new IOException("No backup destination");
            try (
                FileInputStream input = new FileInputStream(staged);
                OutputStream output = resolver.openOutputStream(destination, "w")
            ) {
                if (output == null) throw new IOException("Backup destination could not be opened");
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
            }
            JSObject response = new JSObject();
            response.put("saved", true);
            call.resolve(response);
        } catch (IOException | SecurityException e) {
            if (destination != null) {
                try {
                    DocumentsContract.deleteDocument(resolver, destination);
                } catch (IOException | RuntimeException ignored) {
                    // A provider may refuse to remove a failed write.
                }
            }
            call.reject("Could not write the backup file");
        } finally {
            staged.delete();
        }
    }
}
