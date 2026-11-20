package io.github.gy8s.fitnessdex;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.Map;
import java.util.UUID;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "Steps", permissions = {
    @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class StepsPlugin extends Plugin {
    static boolean hasPermission(Context context) {
        return Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public synchronized void status(PluginCall call) {
        SharedPreferences state = StepsService.preferences(getContext());
        JSObject current = new JSObject();
        current.put("available", StepsService.counter(getContext()) != null);
        current.put("enabled", state.getBoolean("enabled", false) && hasPermission(getContext()));
        current.put("running", StepsService.running);
        String day = StepsService.today();
        String source = state.getString("source", null);
        if (source == null) {
            source = UUID.randomUUID().toString();
            state.edit().putString("source", source).apply();
        }
        Map<String, ?> counts = state.getAll();
        current.put("day", day);
        current.put("source", source);
        current.put("tracked", counts.get("tracked") instanceof Long ? counts.get("tracked") : 0L);
        current.put("today", day.equals(counts.get("day")) ? counts.get("total") : 0L);
        call.resolve(current);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (hasPermission(getContext())) requestNotifications(call);
            else requestPermissionForAlias("activity", call, "activityResult");
        });
    }

    @PermissionCallback
    private void activityResult(PluginCall call) {
        if (call == null) return;
        if (hasPermission(getContext())) requestNotifications(call);
        else call.reject("Allow Physical activity in Android Settings to track steps.");
    }

    private void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else {
            notificationResult(call);
        }
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        if (call == null) return;
        Context context = getContext();
        if (StepsService.counter(context) == null) {
            call.reject("This phone has no Android step counter.");
            return;
        }
        SharedPreferences preferences = StepsService.preferences(context);
        if (StepsService.running && preferences.getBoolean("enabled", false)) {
            status(call);
            return;
        }
        preferences.edit().putBoolean("enabled", true).apply();
        try {
            ContextCompat.startForegroundService(context, new Intent(context, StepsService.class));
            status(call);
        } catch (RuntimeException error) {
            preferences.edit().putBoolean("enabled", false).apply();
            call.reject("Could not start step tracking. Open FitnessDex and try again.", error);
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            StepsService.preferences(getContext()).edit().putBoolean("enabled", false).remove("raw").apply();
            getContext().stopService(new Intent(getContext(), StepsService.class));
            status(call);
        });
    }
}
