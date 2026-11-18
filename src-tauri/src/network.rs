//! Local network discovery and bounded HTTP fetches for the Network page.
//!
//! UPnP uses SSDP M-SEARCH and a small ContentDirectory SOAP browse. SMB
//! lists shares through `smbtree` or `smbclient` when those tools exist, and
//! never stores a password. Podcast feeds and the public directories go
//! through `network_fetch_text`, which always times out and caps the body.
//! Operational failures come back inside the payload so the page stays usable.

use serde::Serialize;
use std::io::{ErrorKind, Read};
use std::net::UdpSocket;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
const SSDP_WAIT: Duration = Duration::from_millis(3200);
const SSDP_READ: Duration = Duration::from_millis(400);
const COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_SERVERS: usize = 16;
const MAX_ENTRIES: usize = 100;
const MAX_SHARES: usize = 100;
const DESCRIPTION_BYTES: usize = 512 * 1024;
const BROWSE_BYTES: usize = 1024 * 1024;
const USER_AGENT: &str = "Kanea/1.0";

fn truncate(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    trimmed.chars().take(max).collect()
}

fn http_agent(timeout: Duration) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout_read(timeout)
        .timeout(timeout)
        .redirects(3)
        .build()
}

fn reject_http_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Some("Enter a URL.".into());
    }
    if trimmed.len() > 2048 {
        return Some("That URL is too long.".into());
    }
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Some("Only http and https URLs can be fetched.".into());
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Some("That URL is not valid.".into());
    }
    let host = trimmed
        .split("://")
        .nth(1)
        .unwrap_or("")
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    if host.is_empty() {
        Some("That URL is not valid.".into())
    } else {
        None
    }
}

fn transport_message(err: &ureq::Transport) -> String {
    let text = err.to_string();
    let lower = text.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        return "The request timed out.".into();
    }
    if lower.contains("dns") || lower.contains("name or service not known") {
        return "The host name did not resolve.".into();
    }
    if lower.contains("connection refused") {
        return "The host refused the connection.".into();
    }
    format!("The request failed ({}).", truncate(&text, 160))
}

fn read_limited(mut reader: impl Read, max_bytes: usize) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let read = reader
            .read(&mut chunk)
            .map_err(|err| format!("The response stopped ({err})."))?;
        if read == 0 {
            break;
        }
        let room = max_bytes.saturating_sub(buf.len());
        if room == 0 {
            break;
        }
        let take = read.min(room);
        buf.extend_from_slice(&chunk[..take]);
        if take < read {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn fetch_text(url: &str, max_bytes: usize, timeout: Duration) -> FetchText {
    if let Some(error) = reject_http_url(url) {
        return FetchText {
            ok: false,
            status: 0,
            body: String::new(),
            error: Some(error),
        };
    }
    let agent = http_agent(timeout);
    match agent
        .get(url.trim())
        .set("User-Agent", USER_AGENT)
        .set("Accept", "*/*")
        .set("Accept-Encoding", "identity")
        .call()
    {
        Ok(response) => {
            let status = response.status();
            match read_limited(response.into_reader(), max_bytes) {
                Ok(body) => FetchText {
                    ok: (200..300).contains(&status),
                    status,
                    body,
                    error: if (200..300).contains(&status) {
                        None
                    } else {
                        Some(format!("The server returned {status}."))
                    },
                },
                Err(error) => FetchText {
                    ok: false,
                    status,
                    body: String::new(),
                    error: Some(error),
                },
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let body = read_limited(response.into_reader(), 4096).unwrap_or_default();
            FetchText {
                ok: false,
                status,
                body,
                error: Some(format!("The server returned {status}.")),
            }
        }
        Err(ureq::Error::Transport(err)) => FetchText {
            ok: false,
            status: 0,
            body: String::new(),
            error: Some(transport_message(&err)),
        },
    }
}

fn post_text(url: &str, content_type: &str, soap_action: &str, body: &str, max_bytes: usize) -> FetchText {
    if let Some(error) = reject_http_url(url) {
        return FetchText {
            ok: false,
            status: 0,
            body: String::new(),
            error: Some(error),
        };
    }
    let agent = http_agent(HTTP_TIMEOUT);
    match agent
        .post(url.trim())
        .set("User-Agent", USER_AGENT)
        .set("Content-Type", content_type)
        .set("SOAPAction", soap_action)
        .set("Accept-Encoding", "identity")
        .send_string(body)
    {
        Ok(response) => {
            let status = response.status();
            match read_limited(response.into_reader(), max_bytes) {
                Ok(text) => FetchText {
                    ok: (200..300).contains(&status),
                    status,
                    body: text,
                    error: if (200..300).contains(&status) {
                        None
                    } else {
                        Some(format!("The server returned {status}."))
                    },
                },
                Err(error) => FetchText {
                    ok: false,
                    status,
                    body: String::new(),
                    error: Some(error),
                },
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let text = read_limited(response.into_reader(), 4096).unwrap_or_default();
            FetchText {
                ok: false,
                status,
                body: text,
                error: Some(format!("The server returned {status}.")),
            }
        }
        Err(ureq::Error::Transport(err)) => FetchText {
            ok: false,
            status: 0,
            body: String::new(),
            error: Some(transport_message(&err)),
        },
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchText {
    pub ok: bool,
    pub status: u16,
    pub body: String,
    pub error: Option<String>,
}

/// Fetch an http(s) document with a timeout and a size cap.
#[tauri::command(async)]
pub fn network_fetch_text(url: String, max_bytes: Option<u32>) -> FetchText {
    let cap = max_bytes.unwrap_or(1_000_000).clamp(1024, 8_000_000) as usize;
    fetch_text(&url, cap, HTTP_TIMEOUT)
}

fn decode_xml_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        rest = &rest[start + 1..];
        let Some(end) = rest.find(';') else {
            out.push('&');
            break;
        };
        if end > 12 {
            out.push('&');
            continue;
        }
        let entity = &rest[..end];
        let decoded = if let Some(hex) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
            u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
        } else if let Some(num) = entity.strip_prefix('#') {
            num.parse::<u32>().ok().and_then(char::from_u32)
        } else {
            match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => None,
            }
        };
        if let Some(ch) = decoded {
            out.push(ch);
            rest = &rest[end + 1..];
        } else {
            out.push('&');
        }
    }
    out.push_str(rest);
    out
}

fn local_name(token: &str) -> &str {
    let name = token.split_whitespace().next().unwrap_or(token);
    name.rsplit(':').next().unwrap_or(name)
}

/// First text node of `local` (case-insensitive). Nested markup is kept so a
/// SOAP `Result` can still be parsed as DIDL.
fn first_element_text(xml: &str, local: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find('<') {
        let start = from + rel;
        if lower[start..].starts_with("<!--") {
            from = lower[start + 4..]
                .find("-->")
                .map(|i| start + 4 + i + 3)
                .unwrap_or(xml.len());
            continue;
        }
        let end_rel = lower[start..].find('>')?;
        let end = start + end_rel;
        let inside = xml[start + 1..end].trim();
        if inside.starts_with('/') || inside.starts_with('!') || inside.starts_with('?') {
            from = end + 1;
            continue;
        }
        let token = inside.trim_end_matches('/').trim();
        if local_name(token).eq_ignore_ascii_case(local) && !inside.ends_with('/') {
            let text_start = end + 1;
            let mut depth = 1;
            let mut cursor = text_start;
            while cursor < xml.len() {
                let Some(next) = lower[cursor..].find('<') else {
                    break;
                };
                let tag_at = cursor + next;
                let Some(tag_end_rel) = lower[tag_at..].find('>') else {
                    break;
                };
                let tag_end = tag_at + tag_end_rel;
                let tag_inside = xml[tag_at + 1..tag_end].trim();
                if tag_inside.starts_with('/') {
                    if local_name(tag_inside.trim_start_matches('/')).eq_ignore_ascii_case(local) {
                        depth -= 1;
                        if depth == 0 {
                            let raw = xml[text_start..tag_at].trim();
                            let decoded = decode_xml_entities(raw);
                            if decoded.contains('<') {
                                return Some(decoded);
                            }
                            let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
                            if !collapsed.is_empty() {
                                return Some(collapsed);
                            }
                            break;
                        }
                    }
                } else if !tag_inside.ends_with('/')
                    && local_name(tag_inside.trim_end_matches('/')).eq_ignore_ascii_case(local)
                {
                    depth += 1;
                }
                cursor = tag_end + 1;
            }
        }
        from = end + 1;
    }
    None
}

fn attr_value<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    let key = format!("{name}=");
    let rel = lower.find(&key.to_ascii_lowercase())?;
    let after = tag[rel + key.len()..].trim_start();
    let quote = after.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let rest = &after[quote.len_utf8()..];
    let end = rest.find(quote)?;
    Some(&rest[..end])
}

fn join_url(base: &str, relative: &str) -> Option<String> {
    let relative = relative.trim();
    if relative.is_empty() {
        return None;
    }
    let lower = relative.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(relative.to_string());
    }
    let base = base.trim();
    let scheme_end = base.find("://")?;
    let authority_start = scheme_end + 3;
    let path_start = base[authority_start..]
        .find('/')
        .map(|i| authority_start + i)
        .unwrap_or(base.len());
    if relative.starts_with('/') {
        return Some(format!("{}{}", &base[..path_start], relative));
    }
    let dir_end = base[..].rfind('/').filter(|i| *i >= authority_start).map(|i| i + 1);
    let prefix = match dir_end {
        Some(end) => &base[..end],
        None => {
            return Some(format!("{base}/{relative}"));
        }
    };
    Some(format!("{prefix}{relative}"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpnpServer {
    pub name: String,
    pub location: String,
    pub control_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpnpScan {
    pub servers: Vec<UpnpServer>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpnpEntry {
    pub id: String,
    pub title: String,
    pub container: bool,
    pub url: Option<String>,
    pub duration_seconds: Option<u32>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpnpBrowse {
    pub ok: bool,
    pub error: Option<String>,
    pub entries: Vec<UpnpEntry>,
}

fn header_value(message: &str, name: &str) -> Option<String> {
    for line in message.split("\r\n").skip(1) {
        let (key, value) = line.split_once(':')?;
        if key.trim().eq_ignore_ascii_case(name) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn parse_ssdp_location(message: &str) -> Option<String> {
    let location = header_value(message, "LOCATION")?;
    let lower = location.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Some(location)
    } else {
        None
    }
}

fn content_directory_control(xml: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("contentdirectory") {
        let at = from + rel;
        let start = at.saturating_sub(800);
        let end = (at + 1800).min(xml.len());
        if let Some(url) = first_element_text(&xml[start..end], "controlURL") {
            return Some(url);
        }
        from = at + "contentdirectory".len();
    }
    None
}

fn describe_server(location: &str, xml: &str) -> UpnpServer {
    let name = first_element_text(xml, "friendlyName")
        .map(|name| truncate(&name, 160))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| host_label(location));
    let base = first_element_text(xml, "URLBase").unwrap_or_else(|| location.to_string());
    let control_url = content_directory_control(xml).and_then(|relative| join_url(&base, &relative));
    UpnpServer {
        name,
        location: location.to_string(),
        control_url,
    }
}

fn host_label(location: &str) -> String {
    let without = location
        .split("://")
        .nth(1)
        .unwrap_or(location);
    let host = without.split(['/', '?', '#']).next().unwrap_or(without);
    if host.is_empty() {
        "Media server".into()
    } else {
        format!("Media server at {host}")
    }
}

fn ssdp_packet(search_target: &str) -> String {
    format!(
        "M-SEARCH * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         MAN: \"ssdp:discover\"\r\n\
         MX: 2\r\n\
         ST: {search_target}\r\n\
         \r\n"
    )
}

fn collect_ssdp_locations() -> Result<Vec<String>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|err| {
        format!("Could not open a socket for UPnP discovery ({err}).")
    })?;
    socket
        .set_read_timeout(Some(SSDP_READ))
        .map_err(|err| format!("Could not time out UPnP discovery ({err})."))?;
    let _ = socket.set_broadcast(true);
    let targets = [
        "urn:schemas-upnp-org:device:MediaServer:1",
        "urn:schemas-upnp-org:service:ContentDirectory:1",
    ];
    for target in targets {
        let packet = ssdp_packet(target);
        if let Err(err) = socket.send_to(packet.as_bytes(), "239.255.255.250:1900") {
            return Err(format!("Could not send an SSDP search ({err})."));
        }
    }
    let deadline = Instant::now() + SSDP_WAIT;
    let mut locations = Vec::new();
    let mut buf = [0u8; 2048];
    while Instant::now() < deadline && locations.len() < MAX_SERVERS {
        match socket.recv_from(&mut buf) {
            Ok((size, _)) => {
                let text = String::from_utf8_lossy(&buf[..size]);
                if let Some(location) = parse_ssdp_location(&text) {
                    if !locations.iter().any(|existing: &String| existing == &location) {
                        locations.push(location);
                    }
                }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock || err.kind() == ErrorKind::TimedOut => {
                continue;
            }
            Err(err) => {
                if locations.is_empty() {
                    return Err(format!("UPnP discovery stopped ({err})."));
                }
                break;
            }
        }
    }
    Ok(locations)
}

fn discover_upnp() -> UpnpScan {
    let locations = match collect_ssdp_locations() {
        Ok(locations) => locations,
        Err(error) => {
            return UpnpScan {
                servers: Vec::new(),
                error: Some(error),
            };
        }
    };
    if locations.is_empty() {
        return UpnpScan {
            servers: Vec::new(),
            error: None,
        };
    }
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut servers = Vec::new();
    for location in locations {
        if Instant::now() >= deadline {
            servers.push(UpnpServer {
                name: host_label(&location),
                location,
                control_url: None,
            });
            continue;
        }
        let fetched = fetch_text(&location, DESCRIPTION_BYTES, Duration::from_secs(3));
        if fetched.ok {
            servers.push(describe_server(&location, &fetched.body));
        } else {
            servers.push(UpnpServer {
                name: host_label(&location),
                location,
                control_url: None,
            });
        }
    }
    UpnpScan {
        servers,
        error: None,
    }
}

/// Search the local network for UPnP/DLNA media servers.
#[tauri::command(async)]
pub fn network_discover_upnp() -> UpnpScan {
    discover_upnp()
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn parse_clock(value: &str) -> Option<u32> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let value = value.split('.').next().unwrap_or(value);
    let parts: Vec<&str> = value.split(':').collect();
    let numbers = parts
        .iter()
        .map(|part| part.parse::<u32>().ok())
        .collect::<Option<Vec<_>>>()?;
    let total = match numbers.as_slice() {
        [seconds] => *seconds,
        [minutes, seconds] => minutes.saturating_mul(60).saturating_add(*seconds),
        [hours, minutes, seconds] => hours
            .saturating_mul(3600)
            .saturating_add(minutes.saturating_mul(60))
            .saturating_add(*seconds),
        _ => return None,
    };
    if total == 0 {
        None
    } else {
        Some(total)
    }
}

struct Element<'a> {
    raw_open: &'a str,
    body: &'a str,
}

fn elements_named<'a>(xml: &'a str, local: &str) -> Vec<Element<'a>> {
    let mut found = Vec::new();
    let lower = xml.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find('<') {
        let start = from + rel;
        if lower[start..].starts_with("<!--") {
            from = lower[start + 4..]
                .find("-->")
                .map(|i| start + 4 + i + 3)
                .unwrap_or(xml.len());
            continue;
        }
        let Some(end_rel) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_rel;
        let inside = xml[start + 1..end].trim();
        if inside.starts_with('/') || inside.starts_with('!') || inside.starts_with('?') {
            from = end + 1;
            continue;
        }
        let self_closing = inside.ends_with('/');
        let token = inside.trim_end_matches('/').trim();
        let name = local_name(token).to_string();
        if !name.eq_ignore_ascii_case(local) {
            from = end + 1;
            continue;
        }
        if self_closing {
            found.push(Element {
                raw_open: inside,
                body: "",
            });
            from = end + 1;
            continue;
        }
        let mut depth = 1;
        let mut cursor = end + 1;
        let mut body_end = cursor;
        while cursor < xml.len() {
            let Some(next) = lower[cursor..].find('<') else {
                break;
            };
            let tag_at = cursor + next;
            let Some(tag_end_rel) = lower[tag_at..].find('>') else {
                break;
            };
            let tag_end = tag_at + tag_end_rel;
            let tag_inside = xml[tag_at + 1..tag_end].trim();
            if tag_inside.starts_with('/') {
                let closed = local_name(tag_inside.trim_start_matches('/'));
                if closed.eq_ignore_ascii_case(&name) {
                    depth -= 1;
                    if depth == 0 {
                        body_end = tag_at;
                        cursor = tag_end + 1;
                        break;
                    }
                }
            } else if !tag_inside.ends_with('/') && local_name(tag_inside).eq_ignore_ascii_case(&name) {
                depth += 1;
            }
            cursor = tag_end + 1;
        }
        found.push(Element {
            raw_open: inside,
            body: &xml[end + 1..body_end],
        });
        from = cursor;
        if found.len() >= MAX_ENTRIES {
            break;
        }
    }
    found
}

fn best_resource(body: &str) -> (Option<String>, Option<u32>) {
    let mut fallback: Option<(String, Option<u32>)> = None;
    for res in elements_named(body, "res") {
        let url = decode_xml_entities(res.body.trim());
        let lower_url = url.to_ascii_lowercase();
        if !(lower_url.starts_with("http://") || lower_url.starts_with("https://")) {
            continue;
        }
        let protocol = attr_value(res.raw_open, "protocolInfo").unwrap_or("");
        let duration = attr_value(res.raw_open, "duration").and_then(parse_clock);
        let protocol_lower = protocol.to_ascii_lowercase();
        if protocol_lower.contains("image/") {
            continue;
        }
        if protocol_lower.contains("audio/") || protocol_lower.contains("video/") || protocol.is_empty() {
            return (Some(url), duration);
        }
        if fallback.is_none() {
            fallback = Some((url, duration));
        }
    }
    match fallback {
        Some((url, duration)) => (Some(url), duration),
        None => (None, None),
    }
}

fn http_thumbnail(body: &str) -> Option<String> {
    let art = first_element_text(body, "albumArtURI")?;
    let lower = art.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Some(art)
    } else {
        None
    }
}

fn parse_didl(xml: &str) -> Vec<UpnpEntry> {
    let mut entries = Vec::new();
    for container in elements_named(xml, "container") {
        let id = attr_value(container.raw_open, "id").unwrap_or("").trim();
        if id.is_empty() {
            continue;
        }
        let title = first_element_text(container.body, "title").unwrap_or_else(|| "Folder".into());
        entries.push(UpnpEntry {
            id: truncate(id, 240),
            title: truncate(&title, 180),
            container: true,
            url: None,
            duration_seconds: None,
            thumbnail_url: http_thumbnail(container.body),
        });
        if entries.len() >= MAX_ENTRIES {
            return entries;
        }
    }
    for item in elements_named(xml, "item") {
        let id = attr_value(item.raw_open, "id").unwrap_or("").trim();
        let title = first_element_text(item.body, "title").unwrap_or_else(|| "Untitled".into());
        let (url, duration) = best_resource(item.body);
        let Some(url) = url else {
            continue;
        };
        entries.push(UpnpEntry {
            id: truncate(&if id.is_empty() { url.clone() } else { id.to_string() }, 240),
            title: truncate(&title, 180),
            container: false,
            url: Some(url),
            duration_seconds: duration,
            thumbnail_url: http_thumbnail(item.body),
        });
        if entries.len() >= MAX_ENTRIES {
            break;
        }
    }
    entries
}

fn soap_browse_body(object_id: &str, service: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
         <s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
           <s:Body>\
             <u:Browse xmlns:u=\"{service}\">\
               <ObjectID>{}</ObjectID>\
               <BrowseFlag>BrowseDirectChildren</BrowseFlag>\
               <Filter>*</Filter>\
               <StartingIndex>0</StartingIndex>\
               <RequestedCount>{MAX_ENTRIES}</RequestedCount>\
               <SortCriteria></SortCriteria>\
             </u:Browse>\
           </s:Body>\
         </s:Envelope>",
        xml_escape(object_id)
    )
}

fn browse_upnp(control_url: &str, object_id: &str) -> UpnpBrowse {
    if reject_http_url(control_url).is_some() {
        return UpnpBrowse {
            ok: false,
            error: Some("This server did not advertise a ContentDirectory.".into()),
            entries: Vec::new(),
        };
    }
    if object_id.len() > 512 {
        return UpnpBrowse {
            ok: false,
            error: Some("That folder id is not valid.".into()),
            entries: Vec::new(),
        };
    }
    let services = [
        "urn:schemas-upnp-org:service:ContentDirectory:1",
        "urn:schemas-upnp-org:service:ContentDirectory:2",
    ];
    let mut last_error = "This server answered discovery, but ContentDirectory browse failed.".to_string();
    for service in services {
        let action = format!("\"{service}#Browse\"");
        let response = post_text(
            control_url,
            "text/xml; charset=\"utf-8\"",
            &action,
            &soap_browse_body(object_id, service),
            BROWSE_BYTES,
        );
        if !response.ok {
            if let Some(error) = response.error {
                last_error = error;
            }
            continue;
        }
        let Some(result) = first_element_text(&response.body, "Result") else {
            last_error = "The server answered without a browse result.".into();
            continue;
        };
        let didl = if result.contains("&lt;") {
            decode_xml_entities(&result)
        } else {
            result
        };
        return UpnpBrowse {
            ok: true,
            error: None,
            entries: parse_didl(&didl),
        };
    }
    UpnpBrowse {
        ok: false,
        error: Some(last_error),
        entries: Vec::new(),
    }
}

/// Browse one ContentDirectory container. A failure still leaves the server listed.
#[tauri::command(async)]
pub fn network_browse_upnp(control_url: String, object_id: String) -> UpnpBrowse {
    browse_upnp(control_url.trim(), object_id.trim())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbShare {
    pub server: String,
    pub name: String,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbScan {
    pub shares: Vec<SmbShare>,
    pub message: Option<String>,
    pub tool_missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbEntry {
    pub name: String,
    pub directory: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmbBrowse {
    pub ok: bool,
    pub error: Option<String>,
    pub entries: Vec<SmbEntry>,
}

fn command_exists(program: &str) -> bool {
    Command::new(program)
        .arg("-V")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

struct CommandOutput {
    status_ok: bool,
    stdout: String,
    stderr: String,
}

fn run_command(program: &str, args: &[String]) -> Result<CommandOutput, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| {
            if err.kind() == ErrorKind::NotFound {
                format!("{program} is not installed")
            } else {
                format!("Could not run {program} ({err}).")
            }
        })?;
    let started = Instant::now();
    loop {
        if started.elapsed() > COMMAND_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{program} timed out."));
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(err) => return Err(format!("{program} failed ({err}).")),
        }
    }
    let output = child
        .wait_with_output()
        .map_err(|err| format!("{program} failed ({err})."))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(CommandOutput {
        status_ok: output.status.success(),
        stdout: truncate_bytes(&stdout, 1_000_000),
        stderr: truncate_bytes(&stderr, 16_000),
    })
}

fn truncate_bytes(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    text[..end].to_string()
}

fn smb_config_file() -> Result<std::path::PathBuf, String> {
    let path = std::env::temp_dir().join(format!(
        "kanea-smb-{}-{}.conf",
        std::process::id(),
        Instant::now().elapsed().as_nanos()
    ));
    let body = "\
[global]
   workgroup = WORKGROUP
   client min protocol = CORE
   client max protocol = SMB3
   name resolve order = bcast host
";
    std::fs::write(&path, body).map_err(|err| format!("Could not prepare an SMB client config ({err})."))?;
    Ok(path)
}

struct TempConfig(std::path::PathBuf);

impl Drop for TempConfig {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn valid_unc_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|ch| !ch.is_control() && ch != '/' && ch != '\\' && ch != '"' && ch != '\0')
}

fn parse_smbtree(text: &str) -> Vec<SmbShare> {
    let mut shares = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix(r"\\") else {
            continue;
        };
        let Some((server, after)) = rest.split_once('\\') else {
            continue;
        };
        let server = server.trim();
        if !valid_unc_component(server) {
            continue;
        }
        let (share, comment) = if let Some((share, comment)) = after.split_once('\t') {
            (share.trim(), comment.trim().to_string())
        } else {
            let mut parts = after.split_whitespace();
            let share = parts.next().unwrap_or("").trim();
            let comment = parts.collect::<Vec<_>>().join(" ");
            (share, comment)
        };
        if !valid_unc_component(share) || share.ends_with('$') || share.eq_ignore_ascii_case("IPC") {
            continue;
        }
        if shares.iter().any(|existing: &SmbShare| existing.server == server && existing.name == share) {
            continue;
        }
        shares.push(SmbShare {
            server: server.to_string(),
            name: share.to_string(),
            comment: truncate(&comment, 160),
        });
        if shares.len() >= MAX_SHARES {
            break;
        }
    }
    shares
}

fn parse_smbclient_shares(text: &str, server: &str) -> Vec<SmbShare> {
    let mut shares = Vec::new();
    let mut in_table = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.to_ascii_lowercase().starts_with("sharename") {
            in_table = true;
            continue;
        }
        if !in_table || trimmed.is_empty() || trimmed.starts_with("---") {
            continue;
        }
        if trimmed.starts_with("SMB") || trimmed.to_ascii_lowercase().starts_with("reconnecting") {
            break;
        }
        let mut parts = trimmed.split_whitespace();
        let Some(name) = parts.next() else {
            continue;
        };
        let Some(kind) = parts.next() else {
            continue;
        };
        if !kind.eq_ignore_ascii_case("Disk") || name.ends_with('$') || !valid_unc_component(name) {
            continue;
        }
        let comment = parts.collect::<Vec<_>>().join(" ");
        shares.push(SmbShare {
            server: server.to_string(),
            name: name.to_string(),
            comment: truncate(&comment, 160),
        });
        if shares.len() >= MAX_SHARES {
            break;
        }
    }
    shares
}

fn parse_smbclient_listing(text: &str) -> Result<Vec<SmbEntry>, String> {
    if text.contains("NT_STATUS_ACCESS_DENIED")
        || text.contains("NT_STATUS_LOGON_FAILURE")
        || text.contains("NT_STATUS_WRONG_PASSWORD")
    {
        return Err(
            "This share is visible, but listing it needs access. Passwords are not stored.".into(),
        );
    }
    if text.contains("NT_STATUS_BAD_NETWORK_NAME") || text.contains("NT_STATUS_OBJECT_NAME_NOT_FOUND") {
        return Err("This share is no longer available.".into());
    }
    if text.contains("NT_STATUS_HOST_UNREACHABLE") || text.contains("NT_STATUS_CONNECTION_REFUSED") {
        return Err("The server did not accept a connection.".into());
    }
    let mut entries = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some(split_at) = find_listing_tail(trimmed) else {
            continue;
        };
        let name = trimmed[..split_at].trim();
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        if !name.chars().all(|ch| !ch.is_control() && ch != '/' && ch != '\\') {
            continue;
        }
        let tail = trimmed[split_at..].trim();
        let attr = tail.split_whitespace().next().unwrap_or("");
        let directory = attr.contains('D');
        entries.push(SmbEntry {
            name: truncate(name, 180),
            directory,
        });
        if entries.len() >= MAX_ENTRIES {
            break;
        }
    }
    if entries.is_empty() && text.contains("NT_STATUS_") {
        return Err("This share could not be listed.".into());
    }
    Ok(entries)
}

/// Listing rows end with `ATTR SIZE Dow Mon DD HH:MM:SS YYYY`.
fn find_listing_tail(line: &str) -> Option<usize> {
    let mut index = 0;
    while index < line.len() {
        let Some(rel) = line[index..].find("  ") else {
            break;
        };
        let start = index + rel;
        let tail = line[start..].trim_start();
        let attr = tail.split_whitespace().next().unwrap_or("");
        if !attr.is_empty()
            && attr.len() <= 8
            && attr.chars().all(|ch| matches!(ch, 'A' | 'D' | 'H' | 'S' | 'R' | 'N'))
            && tail_has_date(tail)
        {
            return Some(line.len() - tail.len());
        }
        index = start + 2;
    }
    None
}

fn tail_has_date(tail: &str) -> bool {
    let parts: Vec<&str> = tail.split_whitespace().collect();
    if parts.len() < 7 {
        return false;
    }
    let count = parts.len();
    let dow = parts[count - 5];
    let month = parts[count - 4];
    let day = parts[count - 3];
    let time = parts[count - 2];
    let year = parts[count - 1];
    dow.len() == 3
        && month.len() == 3
        && day.chars().all(|ch| ch.is_ascii_digit())
        && time.contains(':')
        && year.len() == 4
        && year.chars().all(|ch| ch.is_ascii_digit())
}

fn smb_failure_message(output: &CommandOutput) -> String {
    let combined = format!("{}\n{}", output.stdout, output.stderr);
    if combined.contains("netbios name resolution is not configured") {
        return "smbtree could not browse this network because NetBIOS name resolution is not available. No shares are listed.".into();
    }
    if combined.contains("DNS-SD browsing is not supported") {
        return "smbclient cannot browse servers on this system. No shares are listed.".into();
    }
    if combined.contains("NT_STATUS_CONNECTION_REFUSED") {
        return "smbclient could not list shares on this machine. No shares are listed.".into();
    }
    for line in combined.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("Can't load /etc/samba/smb.conf") {
            continue;
        }
        return truncate(line.trim_start_matches("main:").trim(), 220);
    }
    "SMB browsing did not return any shares.".into()
}

fn discover_smb() -> SmbScan {
    let config = match smb_config_file() {
        Ok(path) => TempConfig(path),
        Err(error) => {
            return SmbScan {
                shares: Vec::new(),
                message: Some(error),
                tool_missing: false,
            };
        }
    };
    let config_arg = config.0.to_string_lossy().to_string();
    if command_exists("smbtree") {
        let args = vec![
            "-N".into(),
            "-s".into(),
            config_arg,
            "-d".into(),
            "0".into(),
        ];
        match run_command("smbtree", &args) {
            Ok(output) => {
                let shares = parse_smbtree(&output.stdout);
                if !shares.is_empty() {
                    return SmbScan {
                        shares,
                        message: None,
                        tool_missing: false,
                    };
                }
                if output.status_ok {
                    return SmbScan {
                        shares: Vec::new(),
                        message: None,
                        tool_missing: false,
                    };
                }
                return SmbScan {
                    shares: Vec::new(),
                    message: Some(smb_failure_message(&output)),
                    tool_missing: false,
                };
            }
            Err(error) => {
                if error.contains("not installed") {
                    // Fall through to smbclient.
                } else {
                    return SmbScan {
                        shares: Vec::new(),
                        message: Some(error),
                        tool_missing: false,
                    };
                }
            }
        }
    }
    if command_exists("smbclient") {
        let args = vec![
            "-N".into(),
            "-s".into(),
            config.0.to_string_lossy().to_string(),
            "-L".into(),
            "localhost".into(),
        ];
        match run_command("smbclient", &args) {
            Ok(output) => {
                let shares = parse_smbclient_shares(&output.stdout, "localhost");
                if !shares.is_empty() {
                    return SmbScan {
                        shares,
                        message: None,
                        tool_missing: false,
                    };
                }
                let mut message = smb_failure_message(&output);
                if !command_exists("smbtree") {
                    message = format!(
                        "smbtree is not installed, so other computers were not searched. {message}"
                    );
                }
                return SmbScan {
                    shares: Vec::new(),
                    message: Some(message),
                    tool_missing: !command_exists("smbtree"),
                };
            }
            Err(error) => {
                let tool_missing = error.contains("not installed");
                return SmbScan {
                    shares: Vec::new(),
                    message: Some(error),
                    tool_missing,
                };
            }
        }
    }
    SmbScan {
        shares: Vec::new(),
        message: Some(
            "SMB browsing needs smbtree or smbclient, and neither is installed.".into(),
        ),
        tool_missing: true,
    }
}

/// List SMB shares visible without a password. Missing tools are reported, not invented.
#[tauri::command(async)]
pub fn network_discover_smb() -> SmbScan {
    discover_smb()
}

fn browse_smb(server: &str, share: &str, path: &str) -> SmbBrowse {
    if !valid_unc_component(server) || !valid_unc_component(share) {
        return SmbBrowse {
            ok: false,
            error: Some("That share name is not valid.".into()),
            entries: Vec::new(),
        };
    }
    let relative = match sanitize_rel_path(path) {
        Ok(path) => path,
        Err(error) => {
            return SmbBrowse {
                ok: false,
                error: Some(error),
                entries: Vec::new(),
            };
        }
    };
    if !command_exists("smbclient") {
        return SmbBrowse {
            ok: false,
            error: Some("smbclient is not installed, so this share cannot be listed.".into()),
            entries: Vec::new(),
        };
    }
    let config = match smb_config_file() {
        Ok(path) => TempConfig(path),
        Err(error) => {
            return SmbBrowse {
                ok: false,
                error: Some(error),
                entries: Vec::new(),
            };
        }
    };
    let unc = format!("//{server}/{share}");
    let mut args = vec![
        "-N".into(),
        "-s".into(),
        config.0.to_string_lossy().to_string(),
        "-t".into(),
        "6".into(),
    ];
    if !relative.is_empty() {
        args.push("-D".into());
        args.push(relative);
    }
    args.push(unc);
    args.push("-c".into());
    args.push("ls".into());
    match run_command("smbclient", &args) {
        Ok(output) => {
            let combined = format!("{}\n{}", output.stdout, output.stderr);
            match parse_smbclient_listing(&combined) {
                Ok(entries) => SmbBrowse {
                    ok: true,
                    error: None,
                    entries,
                },
                Err(error) => SmbBrowse {
                    ok: false,
                    error: Some(error),
                    entries: Vec::new(),
                },
            }
        }
        Err(error) => SmbBrowse {
            ok: false,
            error: Some(error),
            entries: Vec::new(),
        },
    }
}

fn sanitize_rel_path(path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Ok(String::new());
    }
    if path.len() > 1024 {
        return Err("That folder path is too long.".into());
    }
    let mut parts = Vec::new();
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err("That folder path is not valid.".into());
        }
        if !segment.chars().all(|ch| !ch.is_control() && ch != '\\' && ch != '"') {
            return Err("That folder path is not valid.".into());
        }
        parts.push(segment);
    }
    Ok(parts.join("/"))
}

/// List one share with `smbclient` and no stored password.
#[tauri::command(async)]
pub fn network_browse_smb(server: String, share: String, path: String) -> SmbBrowse {
    browse_smb(server.trim(), share.trim(), path.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssdp_location_is_case_insensitive() {
        let message = "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nlocation: http://192.168.1.20:8200/rootDesc.xml\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n";
        assert_eq!(
            parse_ssdp_location(message).as_deref(),
            Some("http://192.168.1.20:8200/rootDesc.xml")
        );
    }

    #[test]
    fn device_description_resolves_a_relative_control_url() {
        let xml = r#"
            <root>
              <URLBase>http://192.168.1.20:8200/</URLBase>
              <device>
                <friendlyName>Living Room</friendlyName>
                <serviceList>
                  <service>
                    <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
                    <controlURL>/ctl/ContentDir</controlURL>
                  </service>
                </serviceList>
              </device>
            </root>
        "#;
        let server = describe_server("http://192.168.1.20:8200/rootDesc.xml", xml);
        assert_eq!(server.name, "Living Room");
        assert_eq!(
            server.control_url.as_deref(),
            Some("http://192.168.1.20:8200/ctl/ContentDir")
        );
    }

    #[test]
    fn didl_keeps_real_duration_and_art_only() {
        let xml = r#"
            <DIDL-Lite>
              <container id="64" parentID="0">
                <dc:title>Music</dc:title>
              </container>
              <item id="7" parentID="64">
                <dc:title>Night Drive</dc:title>
                <upnp:albumArtURI>http://192.168.1.20/art.jpg</upnp:albumArtURI>
                <res protocolInfo="http-get:*:image/jpeg:*">http://192.168.1.20/art.jpg</res>
                <res protocolInfo="http-get:*:audio/mpeg:*" duration="0:03:12.000">http://192.168.1.20/song.mp3</res>
              </item>
              <item id="8" parentID="64">
                <dc:title>Live</dc:title>
                <res protocolInfo="http-get:*:audio/mpeg:*">http://192.168.1.20/live</res>
              </item>
            </DIDL-Lite>
        "#;
        let entries = parse_didl(xml);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].container);
        assert_eq!(entries[0].title, "Music");
        assert_eq!(entries[1].url.as_deref(), Some("http://192.168.1.20/song.mp3"));
        assert_eq!(entries[1].duration_seconds, Some(192));
        assert_eq!(
            entries[1].thumbnail_url.as_deref(),
            Some("http://192.168.1.20/art.jpg")
        );
        assert_eq!(entries[2].duration_seconds, None);
        assert_eq!(entries[2].thumbnail_url, None);
    }

    #[test]
    fn smbtree_output_skips_hidden_shares() {
        let text = "\
WORKGROUP
\t\\\\NAS            \t\tDisk station
\t\t\\\\NAS\\Media         \tMovies
\t\t\\\\NAS\\IPC$          \tIPC
";
        let shares = parse_smbtree(text);
        assert_eq!(shares.len(), 1);
        assert_eq!(shares[0].server, "NAS");
        assert_eq!(shares[0].name, "Media");
        assert_eq!(shares[0].comment, "Movies");
    }

    #[test]
    fn smbclient_list_reads_disk_shares_only() {
        let text = "\
        Sharename       Type      Comment
        ---------       ----      -------
        Media           Disk      Movies
        IPC$            IPC       IPC Service
        print$          Disk      Printers
";
        let shares = parse_smbclient_shares(text, "localhost");
        assert_eq!(shares.len(), 1);
        assert_eq!(shares[0].name, "Media");
        assert_eq!(shares[0].comment, "Movies");
    }

    #[test]
    fn smbclient_ls_reads_files_and_access_errors() {
        let listing = "\
  .                                   D        0  Wed Nov 18 12:00:00 2026
  ..                                  D        0  Wed Nov 18 12:00:00 2026
  Music                               D        0  Wed Nov 18 12:00:00 2026
  track.mp3                           A  3482011  Wed Nov 18 12:00:00 2026
";
        let entries = parse_smbclient_listing(listing).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].directory);
        assert_eq!(entries[0].name, "Music");
        assert!(!entries[1].directory);
        assert_eq!(entries[1].name, "track.mp3");
        let denied = parse_smbclient_listing("NT_STATUS_ACCESS_DENIED listing \\NAS\\Media");
        assert!(denied.is_err());
    }

    #[test]
    fn fetch_rejects_non_http_urls() {
        let fetched = fetch_text("file:///etc/passwd", 1024, Duration::from_secs(1));
        assert!(!fetched.ok);
        assert!(fetched.body.is_empty());
    }

    #[test]
    fn clock_duration_ignores_zero() {
        assert_eq!(parse_clock("1:02:03"), Some(3723));
        assert_eq!(parse_clock("0:00"), None);
        assert_eq!(parse_clock(""), None);
    }

    #[test]
    #[ignore]
    fn live_network_scans_do_not_invent_results() {
        let ice = fetch_text(
            "https://dir.xiph.org/yp.xml",
            64 * 1024,
            Duration::from_secs(8),
        );
        let shout = fetch_text(
            "http://yp.shoutcast.com/sbin/newxml.phtml",
            64 * 1024,
            Duration::from_secs(8),
        );
        let upnp = discover_upnp();
        let smb = discover_smb();
        eprintln!(
            "icecast ok={} status={} bytes={} err={:?}",
            ice.ok,
            ice.status,
            ice.body.len(),
            ice.error
        );
        eprintln!(
            "shoutcast ok={} status={} body={:?} err={:?}",
            shout.ok,
            shout.status,
            truncate(&shout.body, 80),
            shout.error
        );
        eprintln!("upnp servers={} err={:?}", upnp.servers.len(), upnp.error);
        eprintln!(
            "smb shares={} missing={} msg={:?}",
            smb.shares.len(),
            smb.tool_missing,
            smb.message
        );
        assert!(ice.ok || ice.error.is_some());
        assert!(shout.ok || shout.error.is_some());
    }
}
