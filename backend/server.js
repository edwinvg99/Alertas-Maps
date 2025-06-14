// Importar los módulos necesarios
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const emailjs = require('@emailjs/nodejs');
const path = require('path');

// Cargar las variables de entorno desde el archivo .env
dotenv.config();

// Crear la aplicación de Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// --- ENDPOINTS DE LA API ---

// Endpoint para obtener la configuración (API Key de Google Maps)
app.get('/api/config', (req, res) => {
    console.log('📡 Solicitud de configuración API recibida.');
    if (process.env.GOOGLE_MAPS_API_KEY) {
        res.json({
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } else {
        console.error('❌ GOOGLE_MAPS_API_KEY no está definida en el entorno.');
        res.status(500).json({ error: 'Error de configuración del servidor: API Key no encontrada.' });
    }
});

app.post('/api/send-email', async (req, res) => {
    const { to_email, message } = req.body;
    console.log('📧 Solicitud de email:', { to_email, message });

    if (!to_email || !message) {
        return res.status(400).json({ error: 'Faltan datos para enviar el correo.' });
    }

    if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID || !process.env.EMAILJS_PUBLIC_KEY || !process.env.EMAILJS_PRIVATE_KEY) {
        console.error('❌ Variables de EmailJS no están completamente definidas en el entorno.');
        return res.status(500).json({ error: 'Error de configuración del servidor: Faltan credenciales de EmailJS.' });
    }

    try {
        const response = await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                to_email: to_email,
                message: message,
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY,
            },
        );

        console.log('✅ Email enviado exitosamente:', response.status, response.text);
        res.status(200).json({ success: 'Correo enviado exitosamente.' });

    } catch (error) {
        console.error('❌ Error al enviar el email:', error.status, error.text);
        res.status(error.status || 500).json({ error: `Hubo un error al enviar el correo: ${error.text || 'Error desconocido'}` });
    }
});

// --- SERVIR FRONTEND ---

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Manejo de rutas del frontend (para SPA y recarga de página)
// Esta ruta debe ir DESPUÉS de las rutas API y de express.static
app.get('*', (req, res) => {
    // Si la ruta no comienza con /api, se asume que es una ruta del frontend
    if (!req.originalUrl.startsWith('/api/')) {
        console.log(`🏠 Sirviendo index.html para la ruta: ${req.originalUrl}`);
        res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
    } else {
        // Si es una ruta API no encontrada, devuelve 404
        console.log('❌ Endpoint API no encontrado:', req.originalUrl);
        res.status(404).json({ error: 'Endpoint API no encontrado' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    console.log(`🌐 Accede al frontend en: http://localhost:${PORT} (si el backend sirve el frontend)`);
    console.log(`📡 Endpoint de configuración API: http://localhost:${PORT}/api/config`);
});
