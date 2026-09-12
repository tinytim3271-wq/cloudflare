using System.Text.Json;
using MechPro.J2534.Core;

namespace MechPro.J2534.Host;

public static class RpcDispatcher
{
    static readonly string? HostToken = Environment.GetEnvironmentVariable("MECHPRO_J2534_TOKEN");

    public static async Task<JsonRpcResponse> DispatchAsync(JsonRpcRequest request, DiagnosticSession session)
    {
        try
        {
            AssertAuth(request.Params);
            var result = request.Method switch
            {
                "ping" => new { ok = true, simulator = session.IsSimulator },
                "listAdapters" => AdapterRegistry.ListAdapters(),
                "connect" => session.Connect(ParseConnect(request.Params)),
                "disconnect" => session.Disconnect(),
                "getConnectionStatus" => session.GetConnectionStatus(),
                "readVin" => await session.ReadVinAsync(),
                "identifyEcus" => await session.IdentifyEcusAsync(),
                "readDtcs" => await session.ReadDtcsAsync(),
                "clearDtcs" => await ClearDtcs(request.Params, session),
                "securityAccess" => await session.SecurityAccessAsync(GetString(request.Params, "scope") ?? "immobilizer"),
                "addKey" => await ProgramKey("add_key", request.Params, session),
                "programKey" => await ProgramKey("add_key", request.Params, session),
                "allKeysLost" => await ProgramKey("all_keys_lost", request.Params, session),
                "programRemote" => await ProgramKey("program_remote", request.Params, session),
                "eraseKeys" => await ProgramKey("erase_keys", request.Params, session),
                "flashModule" => await FlashModule(request.Params, session),
                "startLiveLog" => session.StartLiveLog(),
                "stopLiveLog" => session.StopLiveLog(),
                "pollLiveLog" => session.PollLiveLog(ParseSince(request.Params)),
                "identifyVehicle" => await session.IdentifyVehicleAsync(),
                _ => throw new InvalidOperationException($"Unknown method: {request.Method}"),
            };
            return JsonRpcResponse.Ok(request.Id, result);
        }
        catch (Exception ex)
        {
            return JsonRpcResponse.Fail(request.Id, -32000, ex.Message);
        }
    }

    // Tokens are scoped to a mode: the simulator accepts SIMULATE tokens; real
    // hardware requires LIVE tokens (and a licensed AutoAuth security provider).
    static string ExpectedMode(DiagnosticSession session) => session.IsSimulator ? "simulate" : "live";

    static async Task<object> ClearDtcs(JsonElement? element, DiagnosticSession session)
    {
        CapabilityToken.Verify(GetString(element, "authorizationToken"), "clear_dtcs", ExpectedMode(session));
        return await session.ClearDtcsAsync();
    }

    static async Task<object> ProgramKey(string procedure, JsonElement? element, DiagnosticSession session)
    {
        var payload = CapabilityToken.Verify(GetString(element, "authorizationToken"), procedure, ExpectedMode(session));
        return await session.ProgramKeyAsync(procedure, payload.Vin);
    }

    static async Task<object> FlashModule(JsonElement? element, DiagnosticSession session)
    {
        var payload = CapabilityToken.Verify(GetString(element, "authorizationToken"), "module_flash", ExpectedMode(session));
        var target = GetString(element, "target") ?? "0x7E1";
        var firmware = ReadFirmware(element);
        var version = GetFirmwareVersion(element) ?? $"live-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        return await session.FlashModuleAsync(target, firmware, version, payload.Vin);
    }

    static byte[] ReadFirmware(JsonElement? element)
    {
        if (element is not null && element.Value.TryGetProperty("firmware", out var fw))
        {
            if (fw.TryGetProperty("data", out var data) && data.GetString() is { Length: > 0 } b64)
            {
                return Convert.FromBase64String(b64);
            }
            if (fw.TryGetProperty("size", out var size) && size.TryGetInt32(out var n) && n > 0)
            {
                return new byte[n];
            }
        }
        throw new InvalidOperationException("Firmware payload (data or size) is required for module flash");
    }

    static string? GetFirmwareVersion(JsonElement? element)
    {
        if (element is not null && element.Value.TryGetProperty("firmware", out var fw)
            && fw.TryGetProperty("version", out var v))
        {
            return v.GetString();
        }
        return null;
    }

    static string? GetString(JsonElement? element, string name)
    {
        if (element is not null && element.Value.TryGetProperty(name, out var value))
        {
            return value.GetString();
        }
        return null;
    }

    static void AssertAuth(JsonElement? element)
    {
        // Fail closed unless explicitly opted into unauthenticated local/dev hosts.
        if (string.IsNullOrEmpty(HostToken))
        {
            if (Environment.GetEnvironmentVariable("MECHPRO_ALLOW_UNAUTHENTICATED_HOST") == "1") return;
            throw new UnauthorizedAccessException("Unauthorized J2534 RPC — host token not configured");
        }
        if (element is null || !element.Value.TryGetProperty("authToken", out var token)
            || token.GetString() != HostToken)
        {
            throw new UnauthorizedAccessException("Unauthorized J2534 RPC — invalid host token");
        }
    }

    static ConnectParams ParseConnect(JsonElement? element)
    {
        if (element is null) return new ConnectParams();
        return JsonSerializer.Deserialize<ConnectParams>(element.Value.GetRawText(), JsonOptions.Rpc) ?? new ConnectParams();
    }

    static long ParseSince(JsonElement? element)
    {
        if (element is null || !element.Value.TryGetProperty("since", out var since)) return 0;
        return since.GetInt64();
    }
}
