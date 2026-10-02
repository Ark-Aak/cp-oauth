export function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function decodeExtensions(
    value?: AuthenticationExtensionsClientInputsJSON
): AuthenticationExtensionsClientInputs | undefined {
    if (!value) return undefined;
    const { largeBlob, prf, ...extensions } = value;
    const decodePrf = (
        item: AuthenticationExtensionsPRFValuesJSON
    ): AuthenticationExtensionsPRFValues => ({
        first: fromBase64Url(item.first),
        ...(item.second ? { second: fromBase64Url(item.second) } : {})
    });
    return {
        ...extensions,
        ...(largeBlob
            ? {
                  largeBlob: {
                      ...largeBlob,
                      ...(largeBlob.write ? { write: fromBase64Url(largeBlob.write) } : {})
                  } as AuthenticationExtensionsLargeBlobInputs
              }
            : {}),
        ...(prf
            ? {
                  prf: {
                      ...(prf.eval ? { eval: decodePrf(prf.eval) } : {}),
                      ...(prf.evalByCredential
                          ? {
                                evalByCredential: Object.fromEntries(
                                    Object.entries(prf.evalByCredential).map(([id, item]) => [
                                        id,
                                        decodePrf(item)
                                    ])
                                )
                            }
                          : {})
                  }
              }
            : {})
    };
}

function decodeDescriptor(value: PublicKeyCredentialDescriptorJSON): PublicKeyCredentialDescriptor {
    return {
        ...value,
        type: value.type as PublicKeyCredentialType,
        id: fromBase64Url(value.id),
        transports: value.transports as AuthenticatorTransport[] | undefined
    };
}

export function toRequestOptions(
    value: PublicKeyCredentialRequestOptionsJSON
): PublicKeyCredentialRequestOptions {
    return {
        ...value,
        challenge: fromBase64Url(value.challenge),
        userVerification: value.userVerification as UserVerificationRequirement | undefined,
        allowCredentials: value.allowCredentials?.map(decodeDescriptor),
        extensions: decodeExtensions(value.extensions)
    };
}

export function toCreationOptions(
    value: PublicKeyCredentialCreationOptionsJSON
): PublicKeyCredentialCreationOptions {
    return {
        ...value,
        challenge: fromBase64Url(value.challenge),
        user: { ...value.user, id: fromBase64Url(value.user.id) },
        attestation: value.attestation as AttestationConveyancePreference | undefined,
        excludeCredentials: value.excludeCredentials?.map(decodeDescriptor),
        extensions: decodeExtensions(value.extensions)
    };
}

export function serializeAuthenticationCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
        id: credential.id,
        rawId: toBase64Url(new Uint8Array(credential.rawId)),
        type: 'public-key' as const,
        authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
        clientExtensionResults: credential.getClientExtensionResults(),
        response: {
            clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
            authenticatorData: toBase64Url(new Uint8Array(response.authenticatorData)),
            signature: toBase64Url(new Uint8Array(response.signature)),
            userHandle: response.userHandle
                ? toBase64Url(new Uint8Array(response.userHandle))
                : undefined
        }
    };
}

export function serializeRegistrationCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
        id: credential.id,
        rawId: toBase64Url(new Uint8Array(credential.rawId)),
        type: 'public-key' as const,
        authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
        clientExtensionResults: credential.getClientExtensionResults(),
        response: {
            clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
            attestationObject: toBase64Url(new Uint8Array(response.attestationObject)),
            transports: response.getTransports?.() ?? []
        }
    };
}
