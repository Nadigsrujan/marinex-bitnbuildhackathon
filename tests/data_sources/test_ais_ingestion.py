import asyncio
import json
from data_sources.aisstream import AISStreamClient

def test_subscription_and_class_b_timestamp(monkeypatch):
    client = AISStreamClient()
    client.api_key = "test-only"
    client._running = True
    sent = []
    class Socket:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def send(self, message):
            sent.append(json.loads(message))
        def __aiter__(self):
            async def messages():
                yield json.dumps({"MessageType": "StandardClassBPositionReport", "MetaData": {"MMSI": 123456789, "ShipName": "TEST VESSEL", "time_utc": "2026-09-13 04:00:00.123456 +0000 UTC"}, "Message": {"StandardClassBPositionReport": {"Latitude": 1.0, "Longitude": 103.0, "Sog": 10, "Cog": 45, "TrueHeading": 511}}})
                client._running = False
            return messages()
    monkeypatch.setattr("websockets.connect", lambda *args, **kwargs: Socket())
    asyncio.run(client._ingest_websocket())
    assert sent[0]["APIKey"] == "test-only"
    assert "Apikey" not in sent[0]
    assert sent[0]["BoundingBoxes"] == [[[-90, -180], [90, 180]]]
    assert client.get_sequence() == 1
    vessel = client.get_live_vessels()[0]
    assert vessel.timestamp == "2026-09-13T04:00:00.123456+00:00"
    assert vessel.heading_deg == 45
