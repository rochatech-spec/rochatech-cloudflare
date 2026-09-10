use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_geolocation::init())
        .setup(|app| {
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("não foi possível resolver app_local_data_dir")
                .join("ritmo-stronghold-salt.txt");

            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build(),
            )?;

            #[cfg(mobile)]
            app.handle()
                .plugin(tauri_plugin_biometric::Builder::new().build())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Ritmo");
}
