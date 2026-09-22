use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

/// Marca que el arranque vino de Windows y no de un doble clic. El plugin de
/// autostart lo agrega a la linea de comandos que registra, asi que es la unica
/// forma de distinguir los dos casos: si Windows la abrio al iniciar sesion, la
/// app se queda en la bandeja en vez de saltar a la cara.
const ARG_AUTOSTART: &str = "--iniciado-por-windows";

/// La ventana se oculta al cerrar, asi que puede estar hidden, minimizada, o las
/// dos cosas. Los tres pasos son necesarios: `show` no desminimiza y `unminimize`
/// no trae al frente.
fn mostrar_ventana(app: &AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Tiene que ir PRIMERO: su trabajo es abortar el proceso nuevo antes de que
    // levante una segunda ventana y un segundo icono de bandeja.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      mostrar_ventana(app);
    }))
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec![ARG_AUTOSTART]),
    ))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // La ventana NACE invisible (`"visible": false` en tauri.conf.json) y se
      // muestra aqui. Ocultarla en el setup no sirve: en Windows el runtime la
      // pinta de todos modos despues, medido — arrancaba a la cara aunque
      // Windows la hubiera lanzado sola. De paso, nacer invisible evita el
      // parpadeo de la ventana en blanco mientras carga la URL de Cloud Run.
      if !std::env::args().any(|arg| arg == ARG_AUTOSTART) {
        mostrar_ventana(app.handle());
      }

      // El estado de la casilla se LEE del registro, nunca se asume: Angel puede
      // haber quitado la entrada desde el Administrador de tareas de Windows y la
      // casilla no debe mentir.
      let inicio_activo = app.autolaunch().is_enabled().unwrap_or(false);

      let item_mostrar = MenuItem::with_id(app, "mostrar", "Mostrar RateApp", true, None::<&str>)?;
      let item_inicio = CheckMenuItem::with_id(
        app,
        "autostart",
        "Iniciar con Windows",
        true,
        inicio_activo,
        None::<&str>,
      )?;
      let item_salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)?;
      let menu = Menu::with_items(
        app,
        &[
          &item_mostrar,
          &PredefinedMenuItem::separator(app)?,
          &item_inicio,
          &PredefinedMenuItem::separator(app)?,
          &item_salir,
        ],
      )?;

      let icono = app
        .default_window_icon()
        .cloned()
        .expect("la app no trae icono por defecto");

      TrayIconBuilder::with_id("main")
        .icon(icono)
        .tooltip("RateApp")
        .menu(&menu)
        // El clic izquierdo abre la ventana; el menu sale con el derecho.
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
          "mostrar" => mostrar_ventana(app),
          "autostart" => {
            let manager = app.autolaunch();
            let activo = manager.is_enabled().unwrap_or(false);
            let resultado = if activo {
              manager.disable()
            } else {
              manager.enable()
            };
            if let Err(err) = resultado {
              log::error!("no se pudo cambiar el arranque con Windows: {err}");
            }
            // Se relee en vez de invertir el valor: si la escritura al registro
            // fallo, la casilla tiene que quedarse donde estaba.
            let _ = item_inicio.set_checked(manager.is_enabled().unwrap_or(false));
          }
          "salir" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            mostrar_ventana(tray.app_handle());
          }
        })
        .build(app)?;

      Ok(())
    })
    .on_window_event(|window, event| {
      // La X no cierra: oculta. Salir de verdad es la opcion del menu de la
      // bandeja, que llama a app.exit().
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
