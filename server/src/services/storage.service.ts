import {
    BlobServiceClient,
    ContainerClient,
    generateBlobSASQueryParameters,
    BlobSASPermissions,
    StorageSharedKeyCredential,
    SASProtocol,
} from '@azure/storage-blob';

const CONTAINER_NAME = 'temp-videos';
const IMAGES_CONTAINER_NAME = 'generated-images';
const SAS_EXPIRY_HOURS = 2; // URL válida por 2 horas
const IMAGE_SAS_EXPIRY_HOURS = 24 * 7; // Imagens: URLs válidas por 7 dias

export class StorageService {
    private containerClient: ContainerClient;
    private imagesContainerClient: ContainerClient;
    private sharedKeyCredential: StorageSharedKeyCredential;
    private accountName: string;

    constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('AZURE_STORAGE_CONNECTION_STRING é obrigatória');
        }

        // Extrair account name e key da connection string
        const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
        const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

        if (!accountNameMatch || !accountKeyMatch) {
            throw new Error('Connection string inválida: AccountName ou AccountKey ausente');
        }

        this.accountName = accountNameMatch[1];
        this.sharedKeyCredential = new StorageSharedKeyCredential(
            this.accountName,
            accountKeyMatch[1]
        );

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        this.imagesContainerClient = blobServiceClient.getContainerClient(IMAGES_CONTAINER_NAME);

        console.log(`[StorageService] Conectado ao container '${CONTAINER_NAME}' e '${IMAGES_CONTAINER_NAME}' em '${this.accountName}'`);
    }

    /**
     * Garante que o container de imagens existe
     */
    async ensureImagesContainer(): Promise<void> {
        try {
            await this.imagesContainerClient.createIfNotExists({ access: 'blob' });
        } catch (error) {
            console.warn('[StorageService] Aviso ao criar container de imagens:', error);
        }
    }

    /**
     * Faz upload de uma imagem para o Blob Storage (container de imagens)
     * Retorna a URL pública com SAS token de longa duração
     */
    async uploadImage(
        blobName: string,
        buffer: Buffer,
        contentType: string = 'image/png'
    ): Promise<string> {
        await this.ensureImagesContainer();
        
        const blockBlobClient = this.imagesContainerClient.getBlockBlobClient(blobName);

        console.log(`[StorageService] Uploading image ${blobName} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)...`);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: contentType },
        });

        const sasUrl = this.generateImageSasUrl(blobName);

        console.log(`[StorageService] Image upload concluído: ${blobName}`);
        return sasUrl;
    }

    /**
     * Gera URL com SAS token de longa duração para imagens
     */
    private generateImageSasUrl(blobName: string): string {
        const startsOn = new Date();
        startsOn.setMinutes(startsOn.getMinutes() - 5);

        const expiresOn = new Date();
        expiresOn.setHours(expiresOn.getHours() + IMAGE_SAS_EXPIRY_HOURS);

        const sasToken = generateBlobSASQueryParameters(
            {
                containerName: IMAGES_CONTAINER_NAME,
                blobName,
                permissions: BlobSASPermissions.parse('r'),
                startsOn,
                expiresOn,
                protocol: SASProtocol.HttpsAndHttp,
            },
            this.sharedKeyCredential
        ).toString();

        return `https://${this.accountName}.blob.core.windows.net/${IMAGES_CONTAINER_NAME}/${blobName}?${sasToken}`;
    }

    /**
     * Faz upload de um buffer/stream para o Blob Storage
     * Retorna a URL pública com SAS token
     */
    async uploadVideo(
        blobName: string,
        buffer: Buffer,
        contentType: string = 'video/mp4'
    ): Promise<string> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        console.log(`[StorageService] Uploading ${blobName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)...`);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: contentType },
        });

        // Gerar SAS URL
        const sasUrl = this.generateSasUrl(blobName);

        console.log(`[StorageService] Upload concluído: ${blobName}`);
        return sasUrl;
    }

    /**
     * Faz upload de um arquivo local para o Blob Storage
     */
    async uploadFile(
        blobName: string,
        filePath: string,
        contentType: string = 'video/mp4'
    ): Promise<string> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        console.log(`[StorageService] Uploading file ${filePath} → ${blobName}...`);

        await blockBlobClient.uploadFile(filePath, {
            blobHTTPHeaders: { blobContentType: contentType },
        });

        const sasUrl = this.generateSasUrl(blobName);

        console.log(`[StorageService] Upload concluído: ${blobName}`);
        return sasUrl;
    }

    /**
     * Gera URL com SAS token para acesso temporário ao blob
     */
    private generateSasUrl(blobName: string): string {
        const startsOn = new Date();
        startsOn.setMinutes(startsOn.getMinutes() - 5); // 5 min antes (tolerância clock skew)

        const expiresOn = new Date();
        expiresOn.setHours(expiresOn.getHours() + SAS_EXPIRY_HOURS);

        const sasToken = generateBlobSASQueryParameters(
            {
                containerName: CONTAINER_NAME,
                blobName,
                permissions: BlobSASPermissions.parse('r'), // Somente leitura
                startsOn,
                expiresOn,
                protocol: SASProtocol.HttpsAndHttp,
            },
            this.sharedKeyCredential
        ).toString();

        return `https://${this.accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blobName}?${sasToken}`;
    }

    /**
     * Remove um blob
     */
    async deleteBlob(blobName: string): Promise<void> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.deleteIfExists();
            console.log(`[StorageService] Blob removido: ${blobName}`);
        } catch (error) {
            console.error(`[StorageService] Erro ao remover blob ${blobName}:`, error);
        }
    }

    /**
     * Limpa blobs antigos (mais de X horas)
     */
    async cleanupOldBlobs(maxAgeHours: number = 2): Promise<number> {
        let deleted = 0;
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - maxAgeHours);

        try {
            for await (const blob of this.containerClient.listBlobsFlat()) {
                if (blob.properties.lastModified && blob.properties.lastModified < cutoff) {
                    await this.deleteBlob(blob.name);
                    deleted++;
                }
            }
            if (deleted > 0) {
                console.log(`[StorageService] Limpeza: ${deleted} blobs antigos removidos`);
            }
        } catch (error) {
            console.error('[StorageService] Erro na limpeza:', error);
        }

        return deleted;
    }
}

// Singleton
let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
    if (!storageServiceInstance) {
        storageServiceInstance = new StorageService();
    }
    return storageServiceInstance;
}
