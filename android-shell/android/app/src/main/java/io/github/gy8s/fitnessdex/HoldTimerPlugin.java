package io.github.gy8s.fitnessdex;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HoldTimer")
public class HoldTimerPlugin extends Plugin {
    @PluginMethod
    public void setScreenOn(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        getActivity().runOnUiThread(() -> {
            int flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            if (enabled) {
                getActivity().getWindow().addFlags(flag);
            } else {
                getActivity().getWindow().clearFlags(flag);
            }
            call.resolve();
        });
    }
}
