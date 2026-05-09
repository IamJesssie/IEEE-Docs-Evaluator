package com.ieee.evaluator.config;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.auth.oauth2.TokenResponse;
import com.google.api.client.googleapis.auth.oauth2.GoogleCredential;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Builds a Drive-only OAuth credential from a pre-obtained refresh token.
 *
 * This credential is used exclusively by GoogleDriveConfig to read student
 * submission files shared as "Anyone with the link". It is completely separate
 * from the service account credential used for Google Sheets.
 *
 * To obtain the refresh token, run the OAuth consent flow once using the
 * Google OAuth Playground (https://developers.google.com/oauthplayground):
 *   1. Use your Google Cloud project's client ID and client secret.
 *   2. Authorize the scope: https://www.googleapis.com/auth/drive.readonly
 *   3. Exchange the authorization code for tokens.
 *   4. Copy the refresh token into the GOOGLE_REFRESH_TOKEN environment variable.
 */
@Configuration
public class OAuthCredentialConfig {

    @Value("${app.google.oauth.client-id:}")
    private String clientId;

    @Value("${app.google.oauth.client-secret:}")
    private String clientSecret;

    @Value("${app.google.oauth.refresh-token:}")
    private String refreshToken;

    @Bean(name = "driveOAuthCredential")
    public Credential driveOAuthCredential() {
        if (clientId == null || clientId.isBlank() ||
            clientSecret == null || clientSecret.isBlank() ||
            refreshToken == null || refreshToken.isBlank()) {
            throw new IllegalStateException(
                "Google OAuth credentials for Drive are missing. " +
                "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN " +
                "as environment variables."
            );
        }

        return new GoogleCredential.Builder()
                .setTransport(new com.google.api.client.http.javanet.NetHttpTransport())
                .setJsonFactory(GsonFactory.getDefaultInstance())
                .setClientSecrets(clientId.trim(), clientSecret.trim())
                .build()
                .setFromTokenResponse(
                    new TokenResponse().setRefreshToken(refreshToken.trim())
                );
    }
}