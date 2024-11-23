use std::thread::sleep;
use std::time::Duration;

use std::sync::Mutex;
use tauri::{Manager, Emitter};

static PORTNAME: Mutex<Option<String>> = Mutex::new(None);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn open_uart(name: String) -> bool {
    let mut portname = PORTNAME.lock().unwrap();
    println!("Open UART: {}", name);
    if portname.is_some() {
        println!("Already opened.");
        return false;
    }
    *portname = Some(name);
    println!("Opened.");
    return true
}

#[tauri::command]
fn close_uart() -> bool {
    let mut portname = PORTNAME.lock().unwrap();
    if portname.is_none() {
        return false;
    }
    *portname = None;
    return true
}

// #[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_uart, close_uart])
        .setup(|app| {
            let app_handle = app.app_handle().clone();
            // let _logger_handle = tauri::async_runtime::spawn(async move {
            // std::thread::spawn(move || {
            tauri::async_runtime::spawn(async move {
                // UART からの受信ルーチン
                sleep(std::time::Duration::from_secs(3));

                loop {
                    let portname_mutex = PORTNAME.lock().unwrap();
                    if portname_mutex.is_none() {
                        drop(portname_mutex);
                        sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                    let portname = portname_mutex.as_ref().unwrap();

                    let serial_option = serialport::new(portname, 921600)
                        .stop_bits(serialport::StopBits::One)
                        .data_bits(serialport::DataBits::Eight)
                        .parity(serialport::Parity::None)
                        .timeout(Duration::from_millis(100))
                        .open();
                    drop(portname_mutex);
                    if serial_option.is_err() {
                        eprintln!("Error: {:?}", serial_option.err());
                        sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                    println!("Serial port opened.");

                    let mut serial = serial_option.unwrap();

                    let mut buf: Vec<u8> = vec![0; 1024];
                    let mut saving = false;
                    let mut data = Vec::new();

                    loop {
                        match serial.read(buf.as_mut_slice()) {
                            Ok(t) => {
                                let bytes = &buf[..t];
                                let res = String::from_utf8(bytes.to_vec());
                                if res.is_err() {
                                    eprintln!("Error: {:?}", res.err());
                                    continue;
                                }

                                let string = res.unwrap();

                                if saving {
                                    data.extend_from_slice(bytes);
                                }

                                if string.contains("[DEBUG]\n") {
                                    saving = true;
                                    data.clear();
                                    println!("Data reception started.");
                                }

                                if string.contains("[END]\n") {
                                    saving = false;
                                    for _ in 0..6 {
                                        data.pop();
                                    }
                                    app_handle
                                        .emit("logdata", Some(String::from_utf8_lossy(&data).to_string())).unwrap();

                                    println!("Data: {:?}", String::from_utf8_lossy(&data));
                                    println!("Data reception completed.");
                                }
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => (),
                            Err(e) => eprintln!("{:?}", e),
                        }
                        if PORTNAME.lock().unwrap().is_none() {
                            break;
                        }
                    }
                    println!("Serial port closed?");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
