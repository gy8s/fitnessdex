package io.github.gy8s.fitnessdex;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "Reminders", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class RemindersPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = ReminderScheduler.canNotify(getContext());
        boolean denied = !granted && (Build.VERSION.SDK_INT < 33
            || getPermissionState("notifications") == PermissionState.DENIED
            || getPermissionState("notifications") == PermissionState.GRANTED);
        result.put("permission", granted ? "granted" : denied ? "denied" : "default");
        call.resolve(result);
    }

    @PluginMethod
    public void ask(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            getActivity().runOnUiThread(() -> requestPermissionForAlias("notifications", call, "permissionResult"));
        } else {
            status(call);
        }
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (call != null) status(call);
    }

    @PluginMethod
    public void test(PluginCall call) {
        if (!ReminderScheduler.canNotify(getContext())) {
            call.reject("Notification permission is not available");
            return;
        }
        if (Boolean.TRUE.equals(call.getBoolean("background"))) {
            ReminderScheduler.scheduleTest(getContext());
        } else {
            ReminderScheduler.show(getContext(), "FitnessDex notifications are working",
                "You will only be reminded about the routines you enable.", "water", 3);
        }
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        execute(() -> ReminderScheduler.schedule(getContext()));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !ReminderScheduler.OPEN.equals(intent.getAction())) return;
        String section = intent.getStringExtra("section");
        if (!"water".equals(section) && !"supplements".equals(section)) return;
        intent.removeExtra("section");
        JSObject result = new JSObject();
        result.put("section", section);
        notifyListeners("open", result, true);
    }
}
