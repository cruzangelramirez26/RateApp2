use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

/// Marca que el arranque vino de Windows y no de un doble clic. El plugin de
/// autostart lo agrega a la linea de comandos que registra, asi que es la unica
/// forma de distinguir los dos casos: si Windows la abrio al iniciar sesion, la
/// app se queda en la bandeja en vez de saltar a la cara.
const ARG_AUTOSTART: &str = "--iniciado-por-windows";

/// La ventana flotante del reproductor. La URL sale de la config para no tener
/// la direccion de Cloud Run escrita en dos lugares.
const VENTANA_PLAYER: &str = "player";

/// Los 7 ratings, en el orden de las teclas 1..7.
const RATINGS: [&str; 7] = ["A+", "A", "B+", "B", "C+", "C", "D"];

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

/// La URL de la app, leida de `tauri.conf.json` (`build.frontendDist`).
fn url_base(app: &AppHandle) -> String {
  match &app.config().build.frontend_dist {
    Some(tauri::utils::config::FrontendDist::Url(url)) => url.to_string(),
    _ => String::new(),
  }
  .trim_end_matches('/')
  .to_string()
}

/// Abre —o reenfoca— la ventana flotante del reproductor.
///
/// Es always-on-top a proposito: reemplaza al PiP del navegador, cuya gracia era
/// justamente quedarse encima de lo que estes haciendo. Y `skip_taskbar` para no
/// ocupar un lugar en la barra de tareas al lado de la ventana principal.
fn abrir_player(app: &AppHandle) {
  if let Some(win) = app.get_webview_window(VENTANA_PLAYER) {
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    return;
  }
  let url = format!("{}/player", url_base(app));
  let destino = match url.parse() {
    Ok(u) => WebviewUrl::External(u),
    Err(_) => return,
  };
  let r = WebviewWindowBuilder::new(app, VENTANA_PLAYER, destino)
    .title("RateApp — Reproductor")
    .inner_size(380.0, 330.0)
    .min_inner_size(240.0, 260.0)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build();
  if let Err(err) = r {
    log::error!("no se pudo abrir el reproductor flotante: {err}");
  }
}

/// Califica lo que suena, sin abrir ninguna ventana.
///
/// Habla con el backend por HTTP en vez de pasar por el frontend, y la razon no
/// es comodidad: la pagina que carga la app es **remota** (Cloud Run), asi que
/// dejarla invocar comandos de Tauri obligaria a abrirle permisos a ese origen.
/// Desde Rust no hace falta.
async fn calificar_lo_que_suena(app: AppHandle, rating: &'static str) {
  let base = url_base(&app);
  let cliente = reqwest::Client::new();

  let sonando = cliente
    .get(format!("{base}/tracks/now-playing"))
    .send()
    .await
    .and_then(|r| r.error_for_status());

  let track = match sonando {
    Ok(r) => r.json::<serde_json::Value>().await.ok(),
    Err(err) => {
      avisar(&app, "RateApp", &format!("No se pudo consultar Spotify: {err}"));
      return;
    }
  };

  let (id, nombre) = match track.as_ref().and_then(|v| v.get("track")) {
    Some(t) if !t.is_null() => (
      t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      t.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    ),
    // Sin nada sonando NO se califica a ciegas: seria escribir una nota sobre
    // una cancion que el usuario no eligio.
    _ => {
      avisar(&app, "RateApp", "No hay nada sonando en Spotify");
      return;
    }
  };
  if id.is_empty() {
    avisar(&app, "RateApp", "No hay nada sonando en Spotify");
    return;
  }

  let envio = cliente
    .post(format!("{base}/tracks/rate"))
    .json(&serde_json::json!({ "track_id": id, "rating": rating }))
    .send()
    .await
    .and_then(|r| r.error_for_status());

  match envio {
    Ok(_) => avisar(&app, &format!("Calificada {rating}"), &nombre),
    Err(err) => avisar(&app, "No se pudo calificar", &format!("{err}")),
  }
}

fn avisar(app: &AppHandle, titulo: &str, cuerpo: &str) {
  let _ = app.notification().builder().title(titulo).body(cuerpo).show();
}

/// Ctrl+Alt+Shift+1..7 califican; Ctrl+Alt+A trae la app; Ctrl+Alt+P el flotante.
///
/// **POR QUE LLEVAN SHIFT LOS DE CALIFICAR, y no hay que quitarselo.** En Windows
/// Ctrl+Alt ES AltGr, y el teclado de Angel es es-MX con distribucion de Espana
/// (`080A:0000040A`), donde AltGr+1/2/3 escriben `|`, `@` y `#`. Con Ctrl+Alt+1..7
/// a secas, escribir una arroba calificaria como A la cancion que suena — en
/// silencio, porque un atajo global se come la tecla antes de que llegue a la
/// app donde se esta escribiendo. Con Shift ya no coincide: la `@` es AltGr+2
/// SIN Shift, y `RegisterHotKey` compara los modificadores exactos.
///
/// **Por que A y no R para traer la app:** Ctrl+Alt+R ya lo tenia otro programa
/// (medido con `RegisterHotKey` el 2026-09-23), igual que Ctrl+Alt+M. A y P
/// estan libres y AltGr no escribe nada con ellas.
///
/// **No se registran las teclas de medios a proposito.** El Spotify de escritorio
/// ya responde a Play/Pausa/Siguiente, y los botones del player de RateApp lo
/// unico que hacen es pedirle a Spotify exactamente eso: registrarlas seria
/// pelearse por la tecla para acabar haciendo lo mismo.
///
/// Devuelve (atajo, accion, etiqueta legible para avisar si no se pudo registrar).
fn atajos() -> Vec<(Shortcut, &'static str, String)> {
  let teclas = [
    Code::Digit1, Code::Digit2, Code::Digit3, Code::Digit4,
    Code::Digit5, Code::Digit6, Code::Digit7,
  ];
  let calificar = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT;
  let ventanas = Modifiers::CONTROL | Modifiers::ALT;
  let mut lista: Vec<(Shortcut, &'static str, String)> = teclas
    .iter()
    .zip(RATINGS.iter())
    .enumerate()
    .map(|(i, (code, rating))| {
      (Shortcut::new(Some(calificar), *code), *rating, format!("Ctrl+Alt+Shift+{}", i + 1))
    })
    .collect();
  lista.push((Shortcut::new(Some(ventanas), Code::KeyA), "__mostrar", "Ctrl+Alt+A".into()));
  lista.push((Shortcut::new(Some(ventanas), Code::KeyP), "__player", "Ctrl+Alt+P".into()));
  lista
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
    .plugin(tauri_plugin_notification::init())
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, atajo, evento| {
          // Solo al SOLTAR: si no, mantener la tecla repetiria la accion.
          if evento.state() != ShortcutState::Released {
            return;
          }
          let Some((_, accion, _)) = atajos().into_iter().find(|(s, _, _)| s == atajo) else {
            return;
          };
          match accion {
            "__mostrar" => mostrar_ventana(app),
            "__player" => abrir_player(app),
            rating => {
              let handle = app.clone();
              tauri::async_runtime::spawn(calificar_lo_que_suena(handle, rating));
            }
          }
        })
        .build(),
    )
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

      // Registrar los atajos NO es fatal: si otro programa ya se quedo con una
      // combinacion, la app tiene que seguir sirviendo igual.
      //
      // Pero tampoco puede fallar CALLADO, y eso ya paso: Ctrl+Alt+R estaba
      // tomado por otro programa y el error solo iba al log, que en el build
      // release ni existe. El atajo simplemente no hacia nada. Por eso los que
      // fallan se avisan con una notificacion al arrancar.
      {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let mut ocupados: Vec<String> = Vec::new();
        for (atajo, accion, etiqueta) in atajos() {
          if let Err(err) = app.global_shortcut().register(atajo) {
            log::error!("atajo ocupado por otro programa ({accion}): {err}");
            ocupados.push(etiqueta);
          }
        }
        if !ocupados.is_empty() {
          avisar(
            app.handle(),
            "Atajos de RateApp ocupados",
            &format!("Otro programa ya usa: {}", ocupados.join(", ")),
          );
        }
      }

      // El estado de la casilla se LEE del registro, nunca se asume: Angel puede
      // haber quitado la entrada desde el Administrador de tareas de Windows y la
      // casilla no debe mentir.
      let inicio_activo = app.autolaunch().is_enabled().unwrap_or(false);

      let item_mostrar =
        MenuItem::with_id(app, "mostrar", "Mostrar RateApp  (Ctrl+Alt+A)", true, None::<&str>)?;
      let item_player = MenuItem::with_id(
        app,
        "player",
        "Reproductor flotante  (Ctrl+Alt+P)",
        true,
        None::<&str>,
      )?;
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
          &item_player,
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
          "player" => abrir_player(app),
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
      // La X no cierra: oculta. Vale para las dos ventanas — cerrar el flotante
      // y volver a abrirlo desde la bandeja es instantaneo asi, y ademas no
      // recarga la pagina. Salir de verdad es la opcion del menu de la bandeja.
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
