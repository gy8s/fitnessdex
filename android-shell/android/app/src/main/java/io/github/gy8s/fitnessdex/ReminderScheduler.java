package io.github.gy8s.fitnessdex;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class ReminderScheduler extends BroadcastReceiver {
    static final String SETTINGS = "fitnessdex-reminders-v1";
    static final String OPEN = "io.github.gy8s.fitnessdex.OPEN_REMINDER";
    static final String OPEN_SECTION = "io.github.gy8s.fitnessdex.reminder.SECTION";
    private static final String DUE = "io.github.gy8s.fitnessdex.REMINDER_DUE";
    private static final String TEST = "io.github.gy8s.fitnessdex.REMINDER_TEST";
    private static final String CHANNEL = "fitnessdex-daily-care";
    private static final long MINUTE = 60000;

    @Override
    public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                receive(context, intent);
            } finally {
                result.finish();
            }
        }, "FitnessDex reminders").start();
    }

    private static synchronized void receive(Context context, Intent intent) {
        long now = System.currentTimeMillis();
        JSONObject settings = read(context, SETTINGS);
        if (settings == null || !settings.optBoolean("enabled") || !canNotify(context)) return;
        if (TEST.equals(intent.getAction())) {
            show(context, "FitnessDex reminders are working", "This reminder arrived through Android.", "water", 3);
            return;
        }
        JSONObject care = care(context);
        long due = intent.getLongExtra("due", 0);
        if (DUE.equals(intent.getAction()) && care != null && now >= due && now - due <= 45 * MINUTE) {
            deliver(context, settings, care, now, due);
        }
        schedule(context);
    }

    static boolean canNotify(Context context) {
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (!notifications.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < 26) return true;
        NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static synchronized void schedule(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        JSONObject settings = read(context, SETTINGS);
        if (settings == null || !settings.optBoolean("enabled") || !canNotify(context)) {
            alarms.cancel(alarm(context, DUE, 0));
            alarms.cancel(alarm(context, TEST, 0));
            NotificationManager notifications = context.getSystemService(NotificationManager.class);
            for (int id = 1; id <= 3; id++) notifications.cancel(id);
            return;
        }
        JSONObject care = care(context);
        if (care == null) {
            alarms.cancel(alarm(context, DUE, 0));
            return;
        }
        long next = next(settings, care, System.currentTimeMillis());
        if (next == Long.MAX_VALUE) alarms.cancel(alarm(context, DUE, 0));
        else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarm(context, DUE, next));
    }

    static void scheduleTest(Context context) {
        context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 20_000, alarm(context, TEST, 0));
    }

    private static PendingIntent alarm(Context context, String action, long due) {
        Intent intent = new Intent(context, ReminderScheduler.class).setAction(action).putExtra("due", due);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static JSONObject read(Context context, String key) {
        File file = new File(context.getFilesDir(), key + ".json");
        if (!file.isFile()) return null;
        try (InputStreamReader input = new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8)) {
            char[] buffer = new char[4096];
            StringBuilder data = new StringBuilder();
            int count;
            while ((count = input.read(buffer)) != -1) data.append(buffer, 0, count);
            return new JSONObject(data.toString());
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    private static JSONObject care(Context context) {
        JSONObject save = read(context, "fitnessdex-v01");
        if (save == null) return null;
        JSONObject care = save.optJSONObject("v9");
        return care == null ? new JSONObject() : care;
    }

    private static long next(JSONObject settings, JSONObject care, long now) {
        Calendar date = Calendar.getInstance();
        date.setTimeInMillis(now);
        long next = Long.MAX_VALUE;
        for (int offset = 0; offset <= 7; offset++, date.add(Calendar.DATE, 1)) {
            if (settings.optBoolean("water")) {
                JSONArray slots = rows(settings, "slots");
                for (int i = 0; i < slots.length(); i++) next = earlier(next, at(date, slots.optString(i)), now);
            }
            if (settings.optBoolean("supplements")) {
                JSONArray items = rows(care.optJSONObject("supplements"), "items");
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (dueOn(item, date)) next = earlier(next, at(date, item.optString("time")), now);
                }
            }
            if (next != Long.MAX_VALUE) return next;
        }
        return next;
    }

    private static long earlier(long next, long candidate, long now) {
        return candidate > now ? Math.min(next, candidate) : next;
    }

    private static long at(Calendar date, String time) {
        if (!time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) return 0;
        Calendar target = (Calendar) date.clone();
        target.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.substring(0, 2)));
        target.set(Calendar.MINUTE, Integer.parseInt(time.substring(3)));
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        return target.getTimeInMillis();
    }

    private static boolean dueOn(JSONObject item, Calendar date) {
        if (item == null) return false;
        String day = day(date.getTimeInMillis());
        String created = item.optString("createdAt");
        if (created.length() >= 10 && created.substring(0, 10).compareTo(day) > 0) return false;
        String archived = item.optString("archivedAt", "");
        if (archived.length() >= 10 && archived.substring(0, 10).compareTo(day) <= 0) return false;
        JSONArray days = rows(item, "days");
        for (int i = 0; i < days.length(); i++) {
            if (days.optInt(i, -1) == date.get(Calendar.DAY_OF_WEEK) - 1) return true;
        }
        return false;
    }

    private static void deliver(Context context, JSONObject settings, JSONObject care, long now, long due) {
        String day = day(now);
        if (!day.equals(day(due))) return;
        Calendar date = Calendar.getInstance();
        date.setTimeInMillis(due);
        SharedPreferences ledger = context.getSharedPreferences("fitnessdex-reminders-delivered", Context.MODE_PRIVATE);
        SharedPreferences.Editor seen = ledger.edit();
        boolean sameDay = day.equals(ledger.getString("day", ""));
        if (!sameDay) seen.clear().putString("day", day);
        if (settings.optBoolean("water")) {
            JSONArray slots = rows(settings, "slots");
            for (int i = 0; i < slots.length(); i++) {
                String time = slots.optString(i);
                String key = "water-" + time;
                if (at(date, time) != due || (sameDay && ledger.getBoolean(key, false))) continue;
                seen.putBoolean(key, true);
                if (waterPending(care.optJSONObject("water"), day, now)) {
                    show(context, "Time for a water check-in", "Log some water if you have had a drink.", "water", 1);
                }
            }
        }
        if (settings.optBoolean("supplements")) {
            JSONObject supplements = care.optJSONObject("supplements");
            JSONArray items = rows(supplements, "items");
            JSONArray taken = rows(supplements, "taken");
            int count = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (!dueOn(item, date) || at(date, item.optString("time")) != due) continue;
                String id = item.optString("id");
                String key = id + "-" + item.optString("time");
                if (sameDay && ledger.getBoolean(key, false)) continue;
                seen.putBoolean(key, true);
                if (!taken(taken, day, id)) count++;
            }
            if (count > 0) {
                show(context, "Supplement check-in", count == 1 ? "Your scheduled supplement is due."
                    : "You have " + count + " scheduled supplements to check in.", "supplements", 2);
            }
        }
        seen.commit();
    }

    private static boolean taken(JSONArray entries, String day, String id) {
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry != null && day.equals(entry.optString("date")) && id.equals(entry.optString("supplementId"))) return true;
        }
        return false;
    }

    private static boolean waterPending(JSONObject water, String day, long now) {
        if (water == null) return true;
        int goal = water.optInt("baseGoal", 2000);
        JSONArray defaults = rows(water, "baseGoalHistory");
        for (int i = 0; i < defaults.length(); i++) {
            JSONObject entry = defaults.optJSONObject(i);
            if (entry != null && day.compareTo(entry.optString("before")) < 0) {
                goal = entry.optInt("ml", goal);
                break;
            }
        }
        JSONArray goals = rows(water, "goals");
        for (int i = 0; i < goals.length(); i++) {
            JSONObject entry = goals.optJSONObject(i);
            if (entry != null && day.equals(entry.optString("date"))) goal = entry.optInt("ml", goal);
        }
        int sum = 0;
        JSONArray entries = rows(water, "entries");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null || !day.equals(entry.optString("date"))) continue;
            sum += entry.optInt("ml");
            try {
                Date logged = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US).parse(entry.optString("at"));
                if (logged != null && now >= logged.getTime() && now - logged.getTime() <= 75 * MINUTE) return false;
            } catch (java.text.ParseException ignored) {}
        }
        return sum < goal;
    }

    private static JSONArray rows(JSONObject object, String key) {
        JSONArray array = object == null ? null : object.optJSONArray(key);
        return array == null ? new JSONArray() : array;
    }

    private static String day(long time) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(time));
    }

    static void show(Context context, String title, String body, String section, int id) {
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (!canNotify(context)) return;
        Notification.Builder notification;
        if (Build.VERSION.SDK_INT >= 26) {
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "Daily care reminders", NotificationManager.IMPORTANCE_DEFAULT));
            notification = new Notification.Builder(context, CHANNEL);
        } else {
            notification = new Notification.Builder(context);
        }
        Intent open = Intent.makeMainActivity(new ComponentName(context, MainActivity.class))
            .putExtra(OPEN_SECTION, section);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        notifications.notify(id, notification.setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title).setContentText(body).setContentIntent(tap).setAutoCancel(true).build());
    }
}
