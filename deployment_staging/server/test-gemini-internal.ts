
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);

    // Tentar possiveis nomes
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-1.5-pro'];

    for (const modelName of models) {
        console.log(`\nTentando modelo: ${modelName}`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'Generate a simple image of a star' }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
            });
            console.log('Sucesso com', modelName);
            // console.log(JSON.stringify(result, null, 2));
            break;
        } catch (error: any) {
            console.error(`Falha com ${modelName}:`, error.message.split('\n')[0]); // Só a primeira linha
        }
    }
}
testGemini();
