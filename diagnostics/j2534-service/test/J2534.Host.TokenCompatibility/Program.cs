using MechPro.J2534.Host;

var token = Environment.GetEnvironmentVariable("WORKER_COMPATIBILITY_TOKEN")
    ?? throw new InvalidOperationException("Worker compatibility token is not configured");
CapabilityToken.VerifyClearDtcs(token);
