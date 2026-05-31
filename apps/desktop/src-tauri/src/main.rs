use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show, &quit])?;
      TrayIconBuilder::new()
        .tooltip("HT LLM Marketplace")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .build(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run HT LLM Marketplace desktop shell");
}
