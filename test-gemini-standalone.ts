
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Carregar .env do server
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('GEMINI_API_KEY não encontrada');
        return;
    }
    console.log('Testando Gemini com chave:', key.substring(0, 5) + '...');

    const genAI = new GoogleGenerativeAI(key);

    // Tentar modelo experimental configurado atualmente
    const modelName = 'gemini-2.0-flash-exp';
    console.log(`Tentando modelo: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 1,
            },
        });

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: 'Generate a simple image of a star' }]
            }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
            } as any,
        });

        console.log('Sucesso!');
        console.log(JSON.stringify(result, null, 2));

    } catch (error: any) {
        console.error('ERRO:', error.message);
        console.error('Detalhes:', JSON.stringify(error, null, 2));
    }
}

testGemini();
