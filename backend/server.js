// Importar los módulos necesarios
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Crear la aplicación de Express
const app = express();

// Middlewares
app.use(cors()); // Habilita CORS para permitir peticiones desde tu frontend
app.use(express.json()); // Permite al servidor entender JSON

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// --- ENDPOINTS DE LA API ---

// Endpoint para obtener la configuración (la API Key de Google Maps)
// Esta es una clave pública, pero la servimos desde aquí para centralizar la configuración.
// ¡RECUERDA restringir esta clave en tu Google Cloud Console a tu dominio!
app.get('/api/config', (req, res) => {
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

// Endpoint para enviar correos electrónicos usando EmailJS Node.js SDK
app.post('/api/send-email', async (req, res) => {
    const { to_email, message } = req.body;

    if (!to_email || !message) {
        return res.status(400).json({ error: 'Faltan datos para enviar el correo.' });
    }

    try {
        // Usar el SDK oficial de EmailJS para Node.js
        const response = await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                to_email: to_email,
                message: message,
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY, // Necesitarás agregar esta variable
            },
        );

        console.log('Email enviado exitosamente:', response.status, response.text);
        res.status(200).json({ success: 'Correo enviado exitosamente.' });

    } catch (error) {
        console.error('Error al enviar el email:', error);
        res.status(500).json({ error: 'Hubo un error al enviar el correo.' });
    }
});

// Servir el frontend para cualquier ruta no API
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Iniciar el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
