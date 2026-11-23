package io.github.gy8s.fitnessdex;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.provider.Settings;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class StepsService extends Service implements SensorEventListener {
    private static final String CHANNEL = "step_tracking";
    private static final int NOTIFICATION_ID = 41;
    private SensorManager sensors;
    private SharedPreferences state;
    private int bootCount;
    static volatile boolean running;

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("step_tracking", Context.MODE_PRIVATE);
    }

    static Sensor counter(Context context) {
        return context.getSystemService(SensorManager.class).getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    static String today() {
        return localDay(System.currentTimeMillis());
    }

    private static String localDay(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date(millis));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        state = preferences(this);
        sensors = getSystemService(SensorManager.class);
        bootCount = Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        showTrackingNotification();
        if (running) return START_STICKY;
        Sensor counter = counter(this);
        if (!state.getBoolean("enabled", false) || !StepsPlugin.hasPermission(this) || counter == null
                || !sensors.registerListener(this, counter, SensorManager.SENSOR_DELAY_NORMAL)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        return START_STICKY;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        long raw = (long) event.values[0];
        long previous = state.getLong("raw", -1);
        boolean sameBoot = state.getInt("boot", -2) == bootCount;
        long delta = previous >= 0 && sameBoot && raw >= previous ? raw - previous : 0;
        long sampleMillis = System.currentTimeMillis()
            - (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000;
        String day = localDay(sampleMillis);
        long total = day.equals(state.getString("day", "")) ? state.getLong("total", 0) : 0;
        state.edit().putInt("boot", bootCount).putLong("raw", raw)
            .putString("day", day).putLong("total", total + delta)
            .putLong("tracked", state.getLong("tracked", 0) + delta).apply();
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        sensors.unregisterListener(this);
        running = false;
        super.onDestroy();
    }

    private void showTrackingNotification() {
        Notification.Builder notification;
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "Step tracking", NotificationManager.IMPORTANCE_LOW)
            );
            notification = new Notification.Builder(this, CHANNEL);
        } else {
            notification = new Notification.Builder(this);
        }
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(NOTIFICATION_ID, notification
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle("FitnessDex is tracking steps")
            .setContentIntent(open)
            .setOngoing(true)
            .build());
    }
}
