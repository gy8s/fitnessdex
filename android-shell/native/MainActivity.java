package io.github.gy8s.fitnessdex;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
