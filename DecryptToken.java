import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class DecryptToken {
  static String decrypt(String cipherText) throws Exception {
    byte[] key = MessageDigest.getInstance("SHA-256").digest("ai-club-demo-token-secret".getBytes(StandardCharsets.UTF_8));
    byte[] payload = Base64.getDecoder().decode(cipherText);
    byte[] iv = java.util.Arrays.copyOfRange(payload, 0, 12);
    byte[] enc = java.util.Arrays.copyOfRange(payload, 12, payload.length);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
    return new String(cipher.doFinal(enc), StandardCharsets.UTF_8);
  }
  public static void main(String[] args) throws Exception {
    System.out.println("gitlab token: " + decrypt("WEDDPX+UX7gAB0JYSOjwq64S3QuTvQh1Gbwenm9LC9koqC9vbO7ENKTaqKuWZ6FKlRfB+37v"));
    System.out.println("model key: " + decrypt("vDw1q3mCnQXhcC76AeZrGZVkL765KggbbHuY2D90fQnpi8DwizcqcDpxmFL83M2Y/c7sRbgggJHMlY5jjrqvgJvw53828Op8Y5dqcz5r3A8cEePgwpesz61WBzDH8DAeqpxzURbx8LXX2up2AWUVoKKVaSKTYAtj3Lw3fwO00fXp43ftRkvfTmzO3SRjihEbYMdyEI2OI+0c"));
  }
}
