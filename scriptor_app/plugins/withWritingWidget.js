// THE WRITING WIDGET: a home-screen widget for the book last worked in: its title, today's words against the daily
// goal (with a bar), and Continue writing, which opens Write on that chapter at its last word (scriptor:///write?at=end).
// It only reads the library file on this phone (never writes it), refreshes every 30 minutes and whenever Scriptor goes
// to the background, and says "Open Scriptor" when there is nothing to show. android/ is generated from app.json, so
// this plugin writes the widget's Kotlin, layout and resources there on each build.
const { withAndroidManifest, withDangerousMod, withMainActivity } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = 'com.scriptor.app';
const c = { ground: '#13161F', raised: '#1C202D', border: '#5A4618', gold: '#F3B63A', goldDeep: '#C98A12', onGold: '#0A0B0E', text: '#F8FAFC', muted: '#94A3B8', track: '#272E40' };

const kotlin = `package ${pkg}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Scriptor's home-screen widget (plugins/withWritingWidget.js). Reads the library file; never writes it. */
class ScriptorWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = render(context)
    for (id in ids) manager.updateAppWidget(id, views)
  }

  private data class Book(val title: String, val today: Int, val goal: Int?)

  companion object {
    /** Redraws every Scriptor widget (when the app goes to the background). Never throws. */
    fun refresh(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, ScriptorWidget::class.java))
        if (ids.isNotEmpty()) {
          val views = render(context)
          for (id in ids) manager.updateAppWidget(id, views)
        }
      } catch (e: Exception) {
      }
    }

    private fun link(context: Context, uri: String, code: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setClassName(context, "${pkg}.MainActivity")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun render(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.scriptor_widget)
      val book = try { read(context) } catch (e: Exception) { null }
      views.setOnClickPendingIntent(R.id.widget_root, link(context, "scriptor:///", 1))
      if (book == null) {
        views.setTextViewText(R.id.widget_title, "Your next page")
        views.setTextViewText(R.id.widget_today, "Open Scriptor to begin")
        views.setViewVisibility(R.id.widget_bar, View.GONE)
        views.setTextViewText(R.id.widget_button, "Open Scriptor")
        views.setOnClickPendingIntent(R.id.widget_button, link(context, "scriptor:///", 2))
        views.setViewVisibility(R.id.widget_sprint, View.GONE)
        return views
      }
      views.setTextViewText(R.id.widget_title, book.title)
      val words = String.format(Locale.US, "%,d", book.today)
      if (book.goal != null && book.goal > 0) {
        val met = book.today >= book.goal
        views.setTextViewText(R.id.widget_today,
          if (met) "Today: " + words + " words · goal met" else "Today: " + words + " of " + String.format(Locale.US, "%,d", book.goal) + " words")
        views.setViewVisibility(R.id.widget_bar, View.VISIBLE)
        views.setProgressBar(R.id.widget_bar, book.goal, minOf(book.today.coerceAtLeast(0), book.goal), false)
      } else {
        views.setTextViewText(R.id.widget_today, "Today: " + words + (if (book.today == 1) " word" else " words"))
        views.setViewVisibility(R.id.widget_bar, View.GONE)
      }
      views.setTextViewText(R.id.widget_button, "Continue writing")
      views.setOnClickPendingIntent(R.id.widget_button, link(context, "scriptor:///write?at=end", 3))
      // "15 min": the same chapter, with a 15-minute sprint started.
      views.setViewVisibility(R.id.widget_sprint, View.VISIBLE)
      views.setOnClickPendingIntent(R.id.widget_sprint, link(context, "scriptor:///write?at=end&sprint=15", 4))
      return views
    }

    /** The book last opened (not archived), today's net words in it, and its daily goal. Null with none. */
    private fun read(context: Context): Book? {
      val file = File(context.filesDir, "library/scriptor.sqlite3")
      if (!file.exists()) return null
      // Opened for reading only by what it asks; read-write so SQLite can use the write-ahead log as the app does.
      val db = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE)
      try {
        var bestId: String? = null
        var bestTitle = ""
        var bestAt = -1.0
        db.rawQuery("SELECT id, json FROM novels", null).use { c ->
          while (c.moveToNext()) {
            val j = JSONObject(c.getString(1))
            if (j.optBoolean("archived", false)) continue
            if (j.isNull("lastOpenedAt")) continue
            val at = j.optDouble("lastOpenedAt", -1.0)
            if (at > bestAt) { bestAt = at; bestId = c.getString(0); bestTitle = j.optString("title", "") }
          }
        }
        val id = bestId ?: return null
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        var words = 0
        db.rawQuery("SELECT json FROM records WHERE project_id = ? AND collection = 'writingSessions'", arrayOf(id)).use { c ->
          while (c.moveToNext()) {
            val j = JSONObject(c.getString(0))
            if (j.optString("day") == today) words += j.optInt("netWords", 0)
          }
        }
        var goal: Int? = null
        db.rawQuery("SELECT json FROM records WHERE project_id = ? AND collection = 'goals' ORDER BY position", arrayOf(id)).use { c ->
          while (goal == null && c.moveToNext()) {
            val j = JSONObject(c.getString(0))
            if (j.optString("kind") == "daily" && j.has("targetWords") && !j.isNull("targetWords")) goal = j.optInt("targetWords")
          }
        }
        return Book(if (bestTitle.isBlank()) "Untitled novel" else bestTitle, words, goal)
      } finally {
        db.close()
      }
    }
  }
}
`;

const layout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/widget_root"
    android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical"
    android:padding="14dp" android:background="@drawable/scriptor_widget_bg">
  <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="SCRIPTOR"
      android:letterSpacing="0.2" android:textSize="11sp" android:textColor="${c.gold}" android:fontFamily="@font/xml_outfit"
      android:textStyle="bold"/>
  <TextView android:id="@+id/widget_title" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:layout_marginTop="4dp" android:maxLines="2" android:ellipsize="end" android:textSize="20sp"
      android:textColor="${c.text}" android:fontFamily="@font/xml_cinzel" android:textStyle="bold" android:text="Your next page"/>
  <TextView android:id="@+id/widget_today" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:layout_marginTop="6dp" android:textSize="13sp" android:textColor="${c.muted}" android:fontFamily="@font/xml_outfit"
      android:text=""/>
  <ProgressBar android:id="@+id/widget_bar" style="@android:style/Widget.ProgressBar.Horizontal"
      android:layout_width="match_parent" android:layout_height="6dp" android:layout_marginTop="6dp"
      android:progressDrawable="@drawable/scriptor_widget_bar" android:max="100" android:progress="0"/>
  <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"/>
  <LinearLayout android:layout_width="match_parent" android:layout_height="44dp" android:layout_marginTop="10dp"
      android:orientation="horizontal">
    <TextView android:id="@+id/widget_button" android:layout_width="0dp" android:layout_height="match_parent"
        android:layout_weight="2" android:gravity="center" android:background="@drawable/scriptor_widget_button"
        android:textSize="15sp" android:textColor="${c.onGold}" android:fontFamily="@font/xml_outfit" android:textStyle="bold"
        android:text="Continue writing"/>
    <TextView android:id="@+id/widget_sprint" android:layout_width="0dp" android:layout_height="match_parent"
        android:layout_weight="1" android:layout_marginStart="8dp" android:gravity="center"
        android:background="@drawable/scriptor_widget_outline" android:textSize="14sp" android:textColor="${c.gold}"
        android:fontFamily="@font/xml_outfit" android:textStyle="bold" android:text="15 min"/>
  </LinearLayout>
</LinearLayout>
`;

const bg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="270" android:startColor="#2A2210" android:endColor="${c.ground}"/>
  <corners android:radius="18dp"/>
  <stroke android:width="1dp" android:color="${c.border}"/>
</shape>
`;
const button = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="0" android:startColor="#FFD36B" android:centerColor="${c.gold}" android:endColor="${c.goldDeep}"/>
  <corners android:radius="10dp"/>
</shape>
`;
const outline = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#00000000"/>
  <corners android:radius="10dp"/>
  <stroke android:width="1dp" android:color="${c.gold}"/>
</shape>
`;
const bar = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background"><shape><corners android:radius="3dp"/><solid android:color="${c.track}"/></shape></item>
  <item android:id="@android:id/progress"><clip><shape><corners android:radius="3dp"/><solid android:color="${c.gold}"/></shape></clip></item>
</layer-list>
`;
const info = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp" android:minHeight="110dp" android:targetCellWidth="4" android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical" android:updatePeriodMillis="1800000" android:widgetCategory="home_screen"
    android:initialLayout="@layout/scriptor_widget" android:previewLayout="@layout/scriptor_widget"
    android:description="@string/scriptor_widget_description"/>
`;
const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="scriptor_widget_description">Your book, today\\'s words and Continue writing</string>
</resources>
`;

module.exports = function withWritingWidget(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    app.receiver = (app.receiver ?? []).filter((r) => r.$['android:name'] !== '.ScriptorWidget');
    app.receiver.push({
      $: { 'android:name': '.ScriptorWidget', 'android:exported': 'false', 'android:label': 'Scriptor' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/scriptor_widget_info' } }],
    });
    return mod;
  });
  // Leaving Scriptor redraws the widget, so today's words are right on the home screen.
  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes('ScriptorWidget.refresh')) {
      src = src.replace(
        /override fun getMainComponentName\(\)/,
        'override fun onPause() {\n    super.onPause()\n    ScriptorWidget.refresh(this)\n  }\n\n  override fun getMainComponentName()',
      );
      if (!src.includes('ScriptorWidget.refresh')) throw new Error('withWritingWidget: MainActivity was not as expected.');
    }
    mod.modResults.contents = src;
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const write = (rel, text) => {
        const at = path.join(root, rel);
        fs.mkdirSync(path.dirname(at), { recursive: true });
        fs.writeFileSync(at, text);
      };
      write(`app/src/main/java/${pkg.replace(/\./g, '/')}/ScriptorWidget.kt`, kotlin);
      write('app/src/main/res/layout/scriptor_widget.xml', layout);
      write('app/src/main/res/drawable/scriptor_widget_bg.xml', bg);
      write('app/src/main/res/drawable/scriptor_widget_button.xml', button);
      write('app/src/main/res/drawable/scriptor_widget_bar.xml', bar);
      write('app/src/main/res/drawable/scriptor_widget_outline.xml', outline);
      write('app/src/main/res/xml/scriptor_widget_info.xml', info);
      write('app/src/main/res/values/scriptor_widget_strings.xml', strings);
      return mod;
    },
  ]);
};
