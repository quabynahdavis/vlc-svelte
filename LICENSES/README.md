# License scope

This repository carries two licenses with different scopes.

| License | File | Applies to |
| --- | --- | --- |
| **MIT** | [`../LICENSE`](../LICENSE) | The original UI redesign source in `src/`, the Tauri shell code in `src-tauri/`, the project documentation in `docs/`, and original assets created for this redesign. |
| **LGPL-2.1-or-later** | [`LGPL-2.1.txt`](LGPL-2.1.txt) | libvlc and VLC-derived components. libvlc is a separate [VideoLAN](https://www.videolan.org/) project. |

## Notes

- The UI redesign is an independent interface. It does not relicense libvlc or any VLC source code.
- VLC, the VLC cone logo and libvlc are trademarks or components of the VideoLAN project. Their names, marks and upstream code remain subject to VideoLAN's own terms; this repository does not grant trademark rights.
- Third-party dependencies keep their own licenses. See `package.json`, `bun.lock` and `src-tauri/Cargo.toml`.
- The exports in `VLC Redesign (Community)/` are design reference material. Confirm their provenance before redistributing them separately from this repository.
