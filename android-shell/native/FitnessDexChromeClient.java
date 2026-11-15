package io.github.gy8s.fitnessdex;

import android.net.Uri;
import android.system.ErrnoException;
import android.system.Os;
import android.webkit.JsPromptResult;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

final class FitnessDexChromeClient extends BridgeWebChromeClient {
    private static final String READ = "FitnessDexStorage:read:";
    private static final String WRITE = "FitnessDexStorage:write:";
    private static final Set<String> PROFILE_KEYS = new HashSet<>(Arrays.asList(
        "fitnessdex-v01",
        "fitnessdex-v01-pre-v03-backup",
        "fitnessdex-v01-pre-v04-backup",
        "fitnessdex-v01-pre-import-backup",
        "fitnessdex-recovery-checkpoints-v1",
        "fitnessdex-android-auth",
        "fitnessdex-android-auth-code-verifier",
        "fitnessdex-android-auth-user"
    ));
    private final Bridge bridge;
    private final File files;

    FitnessDexChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.files = bridge.getContext().getFilesDir();
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String value, JsPromptResult result) {
        boolean reading = message != null && message.startsWith(READ);
        if (!reading && (message == null || !message.startsWith(WRITE))) {
            return super.onJsPrompt(view, url, message, value, result);
        }

        Uri source = Uri.parse(url == null ? "" : url);
        String key = message.substring((reading ? READ : WRITE).length());
        if (!"https".equals(source.getScheme()) || !"localhost".equals(source.getHost())
                || (source.getPort() != -1 && source.getPort() != 443) || !PROFILE_KEYS.contains(key)) {
            result.cancel();
            return true;
        }

        // The app's save() contract is synchronous. Disk I/O runs off the UI thread,
        // and the bundled page resumes only after Android acknowledges the operation.
        bridge.execute(() -> {
            String reply;
            try {
                File target = new File(files, key + ".json");
                if (reading) {
                    reply = read(target);
                } else {
                    write(target, value);
                    reply = "saved";
                }
            } catch (IOException | ErrnoException | SecurityException e) {
                reply = null;
            }
            String completed = reply;
            view.post(() -> {
                if (completed == null) result.cancel();
                else result.confirm(completed);
            });
        });
        return true;
    }

    private String read(File target) throws IOException {
        if (!target.exists()) return "";
        try (FileInputStream input = new FileInputStream(target);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return "+" + new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void write(File target, String value) throws IOException, ErrnoException {
        if (value == null || value.isEmpty()) throw new IOException("Missing profile");
        File pending = new File(files, target.getName() + ".pending");
        try {
            try (FileOutputStream output = new FileOutputStream(pending)) {
                output.write(value.getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
            // Rename within the same directory so a killed process leaves either
            // the previous complete snapshot or the newly committed snapshot.
            Os.rename(pending.getAbsolutePath(), target.getAbsolutePath());
        } finally {
            pending.delete();
        }
    }
}
