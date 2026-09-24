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

/// Los 7 ratings, en el orden de las teclas 1..7: 1 = A+ ... 7 = D. TIENE que
/// coincidir con `RATINGS_ORDEN` de `frontend/src/utils/ratings.js`, que es la
/// fuente unica de la app (decision de Angel del 2026-09-23).
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

/// Las marcas con las que la pagina sabe que corre dentro de la app de
/// escritorio. Se inyectan en cada carga, antes que el codigo de la pagina.
///
/// - `__RATEAPP_ESCRITORIO__`: `enEscritorio()` en `utils/reproductor.js`.
/// - `__RATEAPP_BARRA__`: la ventana no trae la barra de Windows y la pagina
///   pinta la suya (`utils/ventana.js`). Es una marca APARTE porque la pagina se
///   actualiza sola con cada push y el instalador no: un escritorio viejo, con
///   barra de Windows y sin el permiso de `ventana-remota.json`, no la tiene, y
///   asi no se le pinta una segunda barra con botones muertos.
const SCRIPT_ESCRITORIO: &str =
  "window.__RATEAPP_ESCRITORIO__ = true; window.__RATEAPP_BARRA__ = true;";

/// La ruta centinela del boton del reproductor. La pagina navega aqui y Rust
/// CANCELA la navegacion, asi que nunca llega a cargarse. Ver `al_navegar`.
const RUTA_REPRODUCTOR: &str = "/__escritorio/reproductor";

/// Abre —o reenfoca— la ventana flotante del reproductor, y si se pide un
/// `modo` ("sonando" | "cola") la pone en esa pestana.
///
/// Es always-on-top a proposito: reemplaza al PiP del navegador, cuya gracia era
/// justamente quedarse encima de lo que estes haciendo. Y `skip_taskbar` para no
/// ocupar un lugar en la barra de tareas al lado de la ventana principal.
fn abrir_player(app: &AppHandle, modo: Option<&str>) {
  if let Some(win) = app.get_webview_window(VENTANA_PLAYER) {
    if let Some(modo) = modo {
      // /player escucha este mensaje para cambiar de pestana sin recargar
      // (es el mismo que le manda el PiP de Chrome). `modo` ya viene validado.
      let _ = win.eval(&format!(
        "window.postMessage({{tipo:'rateapp:modo',modo:'{modo}'}}, window.location.origin)"
      ));
    }
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    return;
  }
  let url = match modo {
    Some(modo) => format!("{}/player?modo={modo}", url_base(app)),
    None => format!("{}/player", url_base(app)),
  };
  let destino = match url.parse() {
    Ok(u) => WebviewUrl::External(u),
    Err(_) => return,
  };
  let r = WebviewWindowBuilder::new(app, VENTANA_PLAYER, destino)
    .title("RateApp — Reproductor")
    // Sin la barra de Windows: /player pinta una tira propia de 24 px sobre su
    // fondo, para arrastrar y cerrar. Por eso el alto minimo sube 24 px, y el
    // area del reproductor sigue llegando a los 140 del modo "mini".
    .decorations(false)
    .initialization_script(SCRIPT_ESCRITORIO)
    .inner_size(380.0, 354.0)
    .min_inner_size(220.0, 164.0)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build();
  if let Err(err) = r {
    log::error!("no se pudo abrir el reproductor flotante: {err}");
  }
}

/// El boton del reproductor de la app: un interruptor, igual que en Chrome. Si
/// la flotante esta a la vista la oculta; si no, la abre en `modo`.
fn alternar_player(app: &AppHandle, modo: &str) {
  if let Some(win) = app.get_webview_window(VENTANA_PLAYER) {
    let visible = win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false);
    if visible {
      let _ = win.hide();
      return;
    }
  }
  abrir_player(app, Some(modo));
}

/// Vigila las navegaciones de la ventana principal. Devuelve false para
/// cancelar una.
///
/// **Por que una navegacion y no un comando de Tauri:** la pagina es REMOTA
/// (Cloud Run), y darle acceso a comandos exigiria abrirle permisos a ese
/// origen en las capabilities — la misma razon por la que los atajos hablan con
/// el backend por HTTP. Una navegacion no pide ningun permiso: la pagina intenta
/// ir a `RUTA_REPRODUCTOR`, aqui se cancela y se abre la ventana. La app no se
/// mueve de pantalla.
///
/// Hasta el 2026-09-23 el boton pedia el PiP de Chrome, que en WebView2 no
/// existe, y no hacia nada: el reproductor solo se abria con Ctrl+Alt+P.
fn al_navegar(app: &AppHandle, url: &tauri::Url) -> bool {
  if url.path() != RUTA_REPRODUCTOR {
    return true;
  }
  // Solo del propio origen: otra pagina no tiene por que abrir ventanas aqui.
  let mismo_origen = url_base(app)
    .parse::<tauri::Url>()
    .map(|base| base.origin() == url.origin())
    .unwrap_or(false);
  if !mismo_origen {
    return true;
  }
  let modo = match url.query_pairs().find(|(k, _)| k == "modo").map(|(_, v)| v.into_owned()) {
    Some(m) if m == "cola" => "cola",
    _ => "sonando",
  };
  // Desde OTRO hilo, no desde el principal. Medido el 2026-09-23 con la
  // depuracion remota de WebView2: creada con `run_on_main_thread`, la ventana
  // aparecia pero su webview se quedaba en `about:blank` para siempre (blanca).
  // Desde un hilo aparte Tauri le pasa la creacion al ciclo de eventos y espera,
  // que es el camino que si carga la URL.
  let handle = app.clone();
  tauri::async_runtime::spawn(async move { alternar_player(&handle, modo) });
  false
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

  let texto = |t: &serde_json::Value, k: &str| t.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
  let (id, nombre, artista, album) = match track.as_ref().and_then(|v| v.get("track")) {
    Some(t) if !t.is_null() => (texto(t, "id"), texto(t, "name"), texto(t, "artist"), texto(t, "album")),
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
    // Con los nombres, aunque el backend ya no deja que un campo vacio pise uno
    // lleno: hasta el 2026-09-23 re-calificar mandando solo el id le borraba el
    // nombre y el artista a la cancion en la DB.
    .json(&serde_json::json!({
      "track_id": id, "rating": rating, "name": nombre, "artist": artista, "album": album,
    }))
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
            "__player" => abrir_player(app, None),
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

      // La ventana principal se crea AQUI y no desde la config
      // (`"create": false`), porque la config no deja colgarle el script de la
      // marca ni el vigilante de navegacion del boton del reproductor.
      let config_main = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("tauri.conf.json no trae la ventana main");
      let handle = app.handle().clone();
      WebviewWindowBuilder::from_config(app.handle(), &config_main)?
        .initialization_script(SCRIPT_ESCRITORIO)
        .on_navigation(move |url| al_navegar(&handle, url))
        .build()?;

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
          "player" => abrir_player(app, None),
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
