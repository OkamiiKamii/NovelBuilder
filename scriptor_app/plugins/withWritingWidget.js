// THE WRITING WIDGET: a home-screen widget for the book last worked in: its title, today's words against the daily
// goal (with a bar), and Continue writing, which opens Write on that chapter at its last word (scriptor:///write?at=end).
// It reads only the small summary file the app writes (files/widget/today.json, src/ui/widgetSummaryFile.ts), never the
// library: a second SQLite in the app's process unlinked the library's write-ahead log and lost saves. It refreshes
// every 30 minutes and soon after Scriptor goes to the background, and says "Open Scriptor" when there is nothing to
// show. android/ is generated from app.json, so this plugin writes the widget's Kotlin, layout and resources there on
// each build.
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
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Scriptor's home-screen widget (plugins/withWritingWidget.js). Reads the app's summary file, never the library. */
class ScriptorWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, render(context, manager.getAppWidgetOptions(id)))
  }

  /** Resized on the home screen: drawn again to fit. */
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, render(context, options))
  }

  internal data class Book(val title: String, val today: Int, val goal: Int?, val lines: String?, val week: List<Int>, val run: String)

  companion object {
    /** Redraws every Scriptor widget (when the app goes to the background). Never throws. */
    fun refresh(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, ScriptorWidget::class.java))
        for (id in ids) manager.updateAppWidget(id, render(context, manager.getAppWidgetOptions(id)))
      } catch (e: Exception) {
      }
    }

    private val dots = intArrayOf(R.id.widget_d0, R.id.widget_d1, R.id.widget_d2, R.id.widget_d3, R.id.widget_d4, R.id.widget_d5, R.id.widget_d6)

    /** The day book's headline (dayBook.ts dayBookHeadline): the days written in a row. */
    private fun headline(n: Int, kept: Boolean): String = when {
      n == 0 -> "Every day you write leaves a mark"
      kept -> if (n == 1) "Written today" else "$n days in a row"
      else -> "$n " + (if (n == 1) "day" else "days in a row") + " · write today to keep it"
    }

    private fun link(context: Context, uri: String, code: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setClassName(context, "${pkg}.MainActivity")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun render(context: Context, options: Bundle?): RemoteViews {
      // As tall as the home screen gives it (portrait uses the larger height): fewer lines of the story when short.
      val height = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) ?: 0
      val storyLines = when { height == 0 || height >= 260 -> 3; height >= 230 -> 2; height >= 205 -> 1; else -> 0 }
      val views = RemoteViews(context.packageName, R.layout.scriptor_widget)
      val book = try { read(context) } catch (e: Exception) { null }
      views.setOnClickPendingIntent(R.id.widget_root, link(context, "scriptor:///", 1))
      if (book == null) {
        views.setTextViewText(R.id.widget_title, "Your next page")
        views.setTextViewText(R.id.widget_today, "Open Scriptor to begin")
        views.setViewVisibility(R.id.widget_lines, View.GONE)
        views.setViewVisibility(R.id.widget_week, View.GONE)
        views.setViewVisibility(R.id.widget_bar, View.GONE)
        views.setTextViewText(R.id.widget_button, "Open Scriptor")
        views.setOnClickPendingIntent(R.id.widget_button, link(context, "scriptor:///", 2))
        views.setViewVisibility(R.id.widget_sprint, View.GONE)
        return views
      }
      views.setTextViewText(R.id.widget_title, book.title)
      views.setViewVisibility(R.id.widget_week, View.VISIBLE)
      for (i in 0 until 7) views.setImageViewResource(dots[i], book.week[i])
      views.setTextViewText(R.id.widget_run, book.run)
      // The last words written, to step back into: the story itself on the home screen.
      if (book.lines != null && storyLines > 0) {
        views.setTextViewText(R.id.widget_lines, book.lines)
        views.setInt(R.id.widget_lines, "setMaxLines", storyLines)
        views.setViewVisibility(R.id.widget_lines, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.widget_lines, View.GONE)
      }
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

    /** The app's summary (src/ui/widgetSummaryFile.ts): the book last opened (not archived), its daily goal, its last
     * lines and each day's net words. Today, the week and the run are worked out here, so they stay right past midnight.
     * Null with no file, a damaged one, another version, or no book. */
    internal fun read(context: Context): Book? {
      // While the app replaces the file (delete, then rename), the finished .tmp is read instead.
      val dir = File(context.filesDir, "widget")
      val file = File(dir, "today.json").takeIf { it.exists() } ?: File(dir, "today.json.tmp")
      if (!file.exists()) return null
      val summary = JSONObject(file.readText())
      if (summary.optInt("version", 0) != 1) return null
      val j = summary.optJSONObject("book") ?: return null
      val days = j.optJSONObject("days") ?: JSONObject()
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
      val words = days.optJSONObject(today)?.optInt("net", 0) ?: 0
      val written = HashSet<String>()
      for (day in days.keys()) if (days.optJSONObject(day)?.optBoolean("written", false) == true) written.add(day)
      val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val cal = Calendar.getInstance()
      val kept = written.contains(today)
      if (!kept) cal.add(Calendar.DAY_OF_MONTH, -1)
      var run = 0
      while (written.contains(fmt.format(cal.time))) { run++; cal.add(Calendar.DAY_OF_MONTH, -1) }
      // This week, Monday first: written, today still to write, a day missed, or a day to come.
      val monday = Calendar.getInstance()
      monday.add(Calendar.DAY_OF_MONTH, -((monday.get(Calendar.DAY_OF_WEEK) + 5) % 7))
      val week = (0 until 7).map {
        val key = fmt.format(monday.time)
        monday.add(Calendar.DAY_OF_MONTH, 1)
        when {
          written.contains(key) -> R.drawable.scriptor_dot_written
          key == today -> R.drawable.scriptor_dot_today
          key > today -> R.drawable.scriptor_dot_ahead
          else -> R.drawable.scriptor_dot_missed
        }
      }
      // optString/optInt read a JSON null as "null"/0: asked first.
      val goal = if (j.isNull("goal")) null else j.optInt("goal")
      val lines = if (j.isNull("lines")) null else j.optString("lines")
      val title = if (j.isNull("title")) "" else j.optString("title", "")
      return Book(if (title.isBlank()) "Untitled novel" else title, words, goal, lines, week, headline(run, kept))
    }
  }
}
`;

// The Quick Settings tile: "Write" in the panel pulled down from the top of the screen, today's words under it, lit once
// the day's goal is met; a tap opens Write at the last word. It reads what the widget reads.
const tile = `package ${pkg}

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import java.util.Locale

class ScriptorTile : TileService() {
  override fun onStartListening() {
    val tile = qsTile ?: return
    val book = try { ScriptorWidget.read(this) } catch (e: Exception) { null }
    val goal = book?.goal
    val met = book != null && goal != null && goal > 0 && book.today >= goal
    tile.label = "Write"
    if (Build.VERSION.SDK_INT >= 29) {
      val words = String.format(Locale.US, "%,d", book?.today ?: 0)
      tile.subtitle = when {
        book == null -> "Scriptor"
        met -> "Goal met · " + words
        goal != null && goal > 0 -> words + " of " + String.format(Locale.US, "%,d", goal) + " today"
        else -> words + " words today"
      }
    }
    tile.state = if (met) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.updateTile()
  }

  override fun onClick() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("scriptor:///write?at=end")).setClassName(this, "${pkg}.MainActivity")
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 5, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
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
  <TextView android:id="@+id/widget_lines" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:layout_marginTop="4dp" android:maxLines="3" android:ellipsize="end" android:textSize="14sp"
      android:lineSpacingMultiplier="1.15" android:textColor="#E2E8F0" android:fontFamily="serif" android:textStyle="italic"
      android:visibility="gone" android:text=""/>
  <LinearLayout android:id="@+id/widget_week" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:layout_marginTop="8dp" android:orientation="horizontal" android:gravity="center_vertical">
      <ImageView android:id="@+id/widget_d0" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d1" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d2" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d3" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d4" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d5" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
      <ImageView android:id="@+id/widget_d6" android:layout_width="12dp" android:layout_height="12dp"
          android:layout_marginEnd="5dp" android:src="@drawable/scriptor_dot_ahead"/>
    <TextView android:id="@+id/widget_run" android:layout_width="0dp" android:layout_height="wrap_content"
        android:layout_weight="1" android:layout_marginStart="6dp" android:maxLines="1" android:ellipsize="end"
        android:textSize="12sp" android:textColor="${c.text}" android:fontFamily="@font/xml_outfit" android:text=""/>
  </LinearLayout>
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
const oval = (fill, stroke) => `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
  <solid android:color="${fill}"/>
  <stroke android:width="${stroke ? '1.5dp' : '0dp'}" android:color="${stroke ?? fill}"/>
  <size android:width="12dp" android:height="12dp"/>
</shape>
`;
const dots = {
  scriptor_dot_written: oval(c.gold, null),
  scriptor_dot_today: oval('#00000000', c.gold),
  scriptor_dot_missed: oval(c.raised, c.track),
  scriptor_dot_ahead: oval('#00000000', c.track),
};
const bar = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background"><shape><corners android:radius="3dp"/><solid android:color="${c.track}"/></shape></item>
  <item android:id="@android:id/progress"><clip><shape><corners android:radius="3dp"/><solid android:color="${c.gold}"/></shape></clip></item>
</layer-list>
`;
const info = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp" android:minHeight="180dp" android:targetCellWidth="4" android:targetCellHeight="3"
    android:resizeMode="horizontal|vertical" android:updatePeriodMillis="1800000" android:widgetCategory="home_screen"
    android:initialLayout="@layout/scriptor_widget" android:previewLayout="@layout/scriptor_widget"
    android:description="@string/scriptor_widget_description"/>
`;
const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="scriptor_widget_description">Your book, today\\'s words and Continue writing</string>
</resources>
`;

// Leaving Scriptor redraws the widget, so today's words are right on the home screen: 1.5 s later, once the app has
// written the summary as it went to the background. An earlier build's onPause (either form) is taken out first.
const legacyPause = 'override fun onPause() {\n    super.onPause()\n    ScriptorWidget.refresh(this)\n  }\n\n  ';
const pause =
  '// scriptor-widget-pause begin\n  override fun onPause() {\n    super.onPause()\n' +
  '    val app = applicationContext\n' +
  '    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ ScriptorWidget.refresh(app) }, 1500)\n' +
  '  }\n  // scriptor-widget-pause end\n\n  ';
function withPause(src) {
  src = src.replace(legacyPause, '').replace(/\/\/ scriptor-widget-pause begin[\s\S]*?\/\/ scriptor-widget-pause end\n\n {2}/, '');
  src = src.replace(/override fun getMainComponentName\(\)/, pause + 'override fun getMainComponentName()');
  if (!src.includes(pause) || src.split('override fun onPause').length !== 2) {
    throw new Error('withWritingWidget: MainActivity was not as expected.');
  }
  return src;
}

module.exports = function withWritingWidget(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    app.receiver = (app.receiver ?? []).filter((r) => r.$['android:name'] !== '.ScriptorWidget');
    app.service = (app.service ?? []).filter((r) => r.$['android:name'] !== '.ScriptorTile');
    app.service.push({
      $: {
        'android:name': '.ScriptorTile',
        'android:exported': 'true',
        'android:label': 'Write',
        'android:icon': '@drawable/scriptor_notification',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
    });
    app.receiver.push({
      $: { 'android:name': '.ScriptorWidget', 'android:exported': 'false', 'android:label': 'Scriptor' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/scriptor_widget_info' } }],
    });
    return mod;
  });
  config = withMainActivity(config, (mod) => {
    mod.modResults.contents = withPause(mod.modResults.contents);
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
      write(`app/src/main/java/${pkg.replace(/\./g, '/')}/ScriptorTile.kt`, tile);
      write('app/src/main/res/layout/scriptor_widget.xml', layout);
      write('app/src/main/res/drawable/scriptor_widget_bg.xml', bg);
      write('app/src/main/res/drawable/scriptor_widget_button.xml', button);
      write('app/src/main/res/drawable/scriptor_widget_bar.xml', bar);
      write('app/src/main/res/drawable/scriptor_widget_outline.xml', outline);
      for (const [name, xml] of Object.entries(dots)) write(`app/src/main/res/drawable/${name}.xml`, xml);
      write('app/src/main/res/xml/scriptor_widget_info.xml', info);
      write('app/src/main/res/values/scriptor_widget_strings.xml', strings);
      return mod;
    },
  ]);
};
