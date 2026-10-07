// Pas de console noire au lancement sous Windows (en release).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    charles_lib::run()
}
