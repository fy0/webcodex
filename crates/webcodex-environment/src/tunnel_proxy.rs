//! A resolved route is explicit: a failed proxy must never become a direct route.
use crate::{SetupDiagnostic, SetupResultValue};
use serde::{Deserialize, Serialize};
use std::process::Command;

pub const TUNNEL_PROXY_ENV: &str = "WEBCODEX_TUNNEL_PROXY";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TunnelProxy {
    url: Option<String>,
}

impl TunnelProxy {
    pub fn parse(value: &str) -> SetupResultValue<Self> {
        if value == "direct" {
            return Ok(Self { url: None });
        }
        let invalid = || {
            SetupDiagnostic::new(
                "tunnel_proxy_invalid",
                "The Tunnel proxy must be an HTTP or HTTPS URL without credentials",
                "Correct this Tunnel's proxy; no alternate route will be used",
            )
        };
        let parsed = url::Url::parse(value).map_err(|_| invalid())?;
        if value.len() > 2048
            || value.contains(['\n', '\r', '\0', '"', '\''])
            || !matches!(parsed.scheme(), "http" | "https")
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.host_str().is_none()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || !matches!(parsed.path(), "" | "/")
        {
            return Err(invalid());
        }
        Ok(Self {
            url: Some(value.to_owned()),
        })
    }

    pub fn value(&self) -> &str {
        self.url.as_deref().unwrap_or("direct")
    }

    pub fn url(&self) -> Option<&str> {
        self.url.as_deref()
    }

    pub fn configure_command(&self, command: &mut Command) {
        for key in [
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "NO_PROXY",
            "http_proxy",
            "https_proxy",
            "all_proxy",
            "no_proxy",
        ] {
            command.env_remove(key);
        }
        if let Some(url) = self.url() {
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
            ] {
                command.env(key, url);
            }
        }
        // Only loopback may bypass an explicit proxy. Direct is an explicit
        // choice and also suppresses OS-level proxy discovery in child clients.
        let bypass = if self.url.is_some() {
            "127.0.0.1,localhost,::1"
        } else {
            "*"
        };
        for key in ["NO_PROXY", "no_proxy"] {
            command.env(key, bypass);
        }
        command.env(TUNNEL_PROXY_ENV, self.value());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_proxy_is_explicit_bounded_and_secret_free() {
        for value in [
            "",
            "socks5://localhost:1080",
            "http://user:secret@localhost:80",
            "http://localhost:80/?x=1",
            "http://localhost:80/#x",
            "http://localhost:80\n",
        ] {
            assert!(TunnelProxy::parse(value).is_err());
        }
        for value in [
            "direct",
            "http://127.0.0.1:7890",
            "https://proxy.example:443",
        ] {
            let proxy = TunnelProxy::parse(value).unwrap();
            assert_eq!(proxy.value(), value);
            let mut command = Command::new("tunnel-client");
            command
                .env("NO_PROXY", "*")
                .env("ALL_PROXY", "http://global.invalid:9");
            proxy.configure_command(&mut command);
            let env: std::collections::BTreeMap<_, _> = command.get_envs().collect();
            assert_eq!(
                env[std::ffi::OsStr::new("ALL_PROXY")].and_then(|v| v.to_str()),
                proxy.url()
            );
            let bypass = if proxy.url().is_some() {
                "127.0.0.1,localhost,::1"
            } else {
                "*"
            };
            assert_eq!(env[std::ffi::OsStr::new("NO_PROXY")].unwrap(), bypass);
        }
    }
}
