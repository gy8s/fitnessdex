package io.github.gy8s.fitnessdex;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.LayerDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.Gravity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int DARK_BACKGROUND = Color.rgb(13, 26, 43);
    private static final int THREE_BUTTON_BACKGROUND = Color.rgb(216, 223, 232);
    private boolean threeButtonNavigation;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupExportPlugin.class);
        registerPlugin(EmailSignInPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            View webView = getBridge().getWebView();
            getBridge().getWebView().setWebChromeClient(new FitnessDexChromeClient(getBridge()));
            Window window = getWindow();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= 29) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }
            View container = (View) webView.getParent();
            LayerDrawable background = new LayerDrawable(new ColorDrawable[] {
                new ColorDrawable(DARK_BACKGROUND), new ColorDrawable(THREE_BUTTON_BACKGROUND)
            });
            background.setLayerGravity(1, Gravity.BOTTOM | Gravity.FILL_HORIZONTAL);
            background.setLayerHeight(1, 0);
            container.setBackground(background);
            ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
                Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                Insets navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                Insets tappable = insets.getInsets(WindowInsetsCompat.Type.tappableElement());
                threeButtonNavigation = tappable.bottom > 0 || tappable.left > 0 || tappable.right > 0;
                int buttonBar = threeButtonNavigation ? navigation.bottom : 0;
                background.setLayerHeight(1, buttonBar);
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                view.invalidate();
                applyDarkSystemBars();
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(container);
            applyDarkSystemBars();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        // Capacitor posts its theme-derived bar style on configuration changes.
        // FitnessDex stays dark in either Android theme.
        getWindow().getDecorView().post(this::applyDarkSystemBars);
    }

    private void applyDarkSystemBars() {
        Window window = getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(threeButtonNavigation);
    }
}
