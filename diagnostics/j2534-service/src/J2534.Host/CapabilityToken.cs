using System.Collections.Concurrent;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MechPro.J2534.Host;

/// <summary>
/// ECDSA P-256 clear_dtcs capability tokens issued by the Cloudflare Worker.
/// </summary>
public static class CapabilityToken
{
    static readonly ConcurrentDictionary<string, byte> Consumed = new();

    public static void VerifyClearDtcs(string? token)
    {
        var raw = (token ?? string.Empty).Trim();
        var parts = raw.Split('.');
        if (parts.Length != 3 || parts[0] != "v1")
        {
            throw new UnauthorizedAccessException("Invalid diagnostics capability token");
        }

        var payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
        using var key = PublicKey();
        if (!key.VerifyData(
            Encoding.UTF8.GetBytes(payloadJson),
            Base64UrlDecode(parts[2]),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
        {
            throw new UnauthorizedAccessException("Invalid diagnostics capability token signature");
        }

        using var doc = JsonDocument.Parse(payloadJson);
        var root = doc.RootElement;
        if (root.GetProperty("v").GetInt32() != 1
            || root.GetProperty("procedure").GetString() != "clear_dtcs")
        {
            throw new UnauthorizedAccessException("Capability token is not valid for clearDtcs");
        }

        var vin = root.GetProperty("vin").GetString();
        var shopId = root.GetProperty("shopId").GetString();
        var jti = root.GetProperty("jti").GetString();
        var exp = root.GetProperty("exp").GetInt64();
        if (string.IsNullOrWhiteSpace(vin) || string.IsNullOrWhiteSpace(shopId) || string.IsNullOrWhiteSpace(jti))
        {
            throw new UnauthorizedAccessException("Capability token payload is incomplete");
        }

        if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > exp)
        {
            throw new UnauthorizedAccessException("Capability token expired");
        }

        if (!Consumed.TryAdd(jti, 0))
        {
            throw new UnauthorizedAccessException("Capability token already used");
        }

        if (Consumed.Count > 500)
        {
            foreach (var consumedKey in Consumed.Keys.Take(50))
            {
                Consumed.TryRemove(consumedKey, out _);
            }
        }
    }

    static ECDsa PublicKey()
    {
        var pem = Environment.GetEnvironmentVariable("MECHPRO_DIAG_SIGNING_PUBLIC_KEY_PEM");
        var key = ECDsa.Create();
        try
        {
            if (!string.IsNullOrWhiteSpace(pem))
            {
                key.ImportFromPem(pem);
            }
            else
            {
                var der = Environment.GetEnvironmentVariable("MECHPRO_DIAG_SIGNING_PUBLIC_KEY");
                if (string.IsNullOrWhiteSpace(der))
                {
                    throw new UnauthorizedAccessException("Diagnostics signing public key is not configured");
                }

                var publicKeyBytes = Convert.FromBase64String(der.Trim());
                key.ImportSubjectPublicKeyInfo(publicKeyBytes, out var bytesRead);
                if (bytesRead != publicKeyBytes.Length)
                {
                    throw new UnauthorizedAccessException("Invalid diagnostics signing public key");
                }
            }

            if (key.KeySize != 256)
            {
                throw new UnauthorizedAccessException("Diagnostics signing public key must use P-256");
            }
            return key;
        }
        catch
        {
            key.Dispose();
            throw;
        }
    }

    static byte[] Base64UrlDecode(string input)
    {
        var padded = input.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        return Convert.FromBase64String(padded);
    }
}
