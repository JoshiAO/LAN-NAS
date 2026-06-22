import socket
# pyrefly: ignore [missing-import]
from zeroconf import ServiceInfo
# pyrefly: ignore [missing-import]
from zeroconf.asyncio import AsyncZeroconf

class MDNSManager:
    def __init__(self, port=8000):
        self.port = port
        self.aio_zeroconf = None
        self.info = None

    async def start(self):
        self.aio_zeroconf = AsyncZeroconf()
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        
        desc = {'path': '/'}
        
        self.info = ServiceInfo(
            "_http._tcp.local.",
            f"LAN-NAS Server._http._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=self.port,
            properties=desc,
            server=f"{hostname}.local.",
        )
        await self.aio_zeroconf.async_register_service(self.info)
        print(f"mDNS Registered: LAN-NAS Server at {local_ip}:{self.port}")

    async def stop(self):
        if self.aio_zeroconf and self.info:
            await self.aio_zeroconf.async_unregister_service(self.info)
            await self.aio_zeroconf.async_close()
            print("mDNS Unregistered")
