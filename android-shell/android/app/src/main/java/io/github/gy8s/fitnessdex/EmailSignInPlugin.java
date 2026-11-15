package io.github.gy8s.fitnessdex;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EmailSignIn")
public final class EmailSignInPlugin extends Plugin {
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !uri.isHierarchical()
                || !"io.github.gy8s.fitnessdex".equals(uri.getScheme())
                || !"auth".equals(uri.getEncodedAuthority())
                || !"/callback".equals(uri.getEncodedPath())) return;

        intent.setData(null);
        JSObject response = new JSObject();
        String code = uri.getQueryParameter("code");
        if (code != null && code.matches("[A-Za-z0-9_-]{16,256}")) {
            response.put("code", code);
        }
        notifyListeners("callback", response, true);
    }
}
