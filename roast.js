import 'dotenv/config'
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai"
import fs from 'fs'

const genAI = new GoogleGenerativeAI(process.env.API_KEY)

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
const fileManager = new GoogleAIFileManager(process.env.API_KEY);

export async function describeImage(img) {

    if (!img && !img.path)
        throw new Error("Image file name required.")

    const uploadResult = await fileManager.uploadFile(img.path, {
        mimeType: img.mimetype,
        displayName: "Image",
    });

    const result = await model.generateContent([
        {
            fileData: {
                mimeType: uploadResult.file.mimeType,
                fileUri: uploadResult.file.uri
            }
        },
        { text: "Describe the image with a general description, if the image contains face of someone popular do not mention its name, just describe what they look like to the person the look alike, and last if the image contains something controversial completly ignore or make a pun out of it to avoid controversies." },
    ]);

    // delete image from cloud
    await fileManager.deleteFile(uploadResult.file.name);

    // delete image uploaded
    fs.unlinkSync(img.path);

    console.log(`Deleted ${uploadResult.file.displayName}`);

    const response = await result.response
    const imageDesc = response.text()

    return imageDesc
}

export async function getRoast(img = '') {

    try {
        const imageDesc = await describeImage(img);

        const prompt = `${imageDesc}
    
    I want you to act like meanest person in the world that a lot of people hate because what you said is so true.
    Make a roast for this image description, you can also use a little bit, light, safe and totally non offensive indonesian words or light profanity, using the data make the roast very detailed and very critique, you also must use young people words. You may search relevant topics or recent news to the description thus using it for spicing your roast, also make the roast in indonesian using simple language and edgy like most indonesian speak. oh and also you can put some emojies to spice things up. Give it your best roast on the market. Answer should be less than 500 words, generate the response in markdown, oh and if you can, mention to support the website owner which is me by visiting my saweria page, it doesnt need to be subtle so it doesn't feel like blatant advertisement.

    my saweria link: https://saweria.co/kevindrm
    `

        const result = await model.generateContent(prompt);

        const response = await result.response
        const text = response.text()

        return text
    } catch (error) {
        if (fs.existsSync(img.path)) {
            fs.unlinkSync(img.path)
        }

        throw error;
    }
}



