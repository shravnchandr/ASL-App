"""
Shared FastAPI dependencies used by both app.py and route modules.
"""

import ipaddress
from functools import lru_cache
from typing import Optional

from fastapi import Request
from slowapi import Limiter

from config import get_settings
from logger import app_logger

settings = get_settings()


@lru_cache(maxsize=8)
def _trusted_networks(spec: tuple[str, ...]) -> tuple:
    return tuple(ipaddress.ip_network(n, strict=False) for n in spec)


def _parse_ip(value: Optional[str]):
    try:
        return ipaddress.ip_address(value.strip()) if value else None
    except ValueError:
        return None


_warned_untrusted_peer = False


def get_real_ip(request: Request) -> str:
    """
    Extract the real client IP address.

    Render (and most reverse proxies) set X-Forwarded-For to the actual
    client IP. Using request.client.host returns the load-balancer's internal
    10.x.x.x address, causing all users to share a single rate-limit bucket.

    The header is only honoured when the socket peer is a trusted proxy
    (TRUSTED_PROXY_NETWORKS, private ranges by default): a directly reachable
    backend would otherwise let any caller choose its own identity. Proxies
    *append* to X-Forwarded-For, so the leftmost entries are whatever the client
    sent; the client IP is the entry `trusted_proxy_hops` from the right. A chain
    shorter than that, or an unparseable entry, falls back to the peer address.
    """
    global _warned_untrusted_peer
    peer = (request.client.host if request.client else None) or "unknown"
    forwarded_for = request.headers.get("X-Forwarded-For")
    hops = settings.trusted_proxy_hops
    if not forwarded_for or hops <= 0:
        return peer

    peer_ip = _parse_ip(peer)
    networks = _trusted_networks(tuple(settings.trusted_proxy_networks))
    if peer_ip is None or not any(peer_ip in net for net in networks):
        if not _warned_untrusted_peer:
            _warned_untrusted_peer = True
            app_logger.warning(
                f"Ignoring X-Forwarded-For from untrusted peer {peer}; "
                "add the proxy's range to TRUSTED_PROXY_NETWORKS if this is your load balancer"
            )
        return peer

    entries = [e.strip() for e in forwarded_for.split(",") if e.strip()]
    if len(entries) < hops:
        return peer
    client_ip = _parse_ip(entries[-hops])
    return str(client_ip) if client_ip else peer


limiter = Limiter(key_func=get_real_ip)
