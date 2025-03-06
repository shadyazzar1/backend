const express = require('express');
const axios = require('axios');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Temporary in-memory store for parent GUIDs
let parentGuids = {
    father: null,
    mother: null
};

// Middleware
app.use(cors({
    origin: '*', // Allow frontend origin
    methods: 'POST',
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// Function to get the access token
async function getAccessToken() {
    const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.CLIENT_ID);
    params.append('client_secret', process.env.CLIENT_SECRET);
    params.append('scope', `${process.env.CRM_URL}/.default`);

    try {
        const response = await axios.post(url, params);
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to create a contact in Dynamics 365
async function createContactInDynamics(data, entityName) {
    const accessToken = await getAccessToken();
    const url = `${process.env.CRM_URL}/api/data/v9.0/${entityName}`;

    const contactData = {
        firstname: data.firstName,
        lastname: data.lastName,
        emailaddress1: data.email,
        telephone1: data.telephone1,
        gendercode: data.gendercode,
        familystatuscode: data.familystatuscode,
        new_academicqualification: data.new_academicqualification,
        jobtitle: data.jobtitle,
        new_jobplace: data.new_jobplace,
        new_type: data.new_type,
        new_nationalid: data.new_nationalid,
        new_chronicdiseases: data.new_chronicdiseases,
        birthdate: data.birthdate,
        new_assignedinanoherschool: data.new_assignedinanoherschool,
        new_previousassignedschool: data.new_previousassignedschool,
        new_transferreason: data.new_transferreason,
        new_ageatnexteducationalyear: data.new_ageatnexteducationalyear,
        statuscode: 100000001,
        new_graduationschool: data.new_graduationschool,
        new_graduationuniversity: data.new_graduationuniversity,
        new_otheracademicqualification: data.new_otheracademicqualification,
        new_previouswork: data.new_previouswork,
        new_moderntechnologies: data.new_moderntechnologies,
        new_expectedsalary: data.new_expectedsalary,
        new_workingfield: data.new_workingfield,
        new_workingreason: data.new_workingreason
    };

    console.log('Request payload:', contactData);

    try {
        const response = await axios.post(url, contactData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
            },
        });

        // Extract the GUID from the Location header
        const locationHeader = response.headers['location'];
        const guid = locationHeader.split('(')[1].split(')')[0];

        console.log(`${entityName} created with GUID:`, guid);
        return { guid };
    } catch (error) {
        console.error(`Error creating ${entityName}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to create ${entityName}: ${error.response ? error.response.data.error.message : error.message}`);
    }
}

// Function to update lookup fields
async function updateLookupField(entityName, entityId, lookupFieldName, lookupEntityName, lookupEntityId) {
    try {
        const accessToken = await getAccessToken();
        const url = `${process.env.CRM_URL}/api/data/v9.0/${entityName}(${entityId})`;

        // Construct the data payload using @odata.bind for the lookup field
        const data = {
            [`${lookupFieldName}@odata.bind`]: `/${lookupEntityName}(${lookupEntityId})`
        };

        await axios.patch(url, data, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
            },
        });

        console.log(`Updated ${lookupFieldName} for ${entityName} with ID: ${entityId}`);
    } catch (error) {
        console.error(`Error updating ${lookupFieldName} for ${entityName}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to update ${lookupFieldName}: ${error.response ? error.response.data.error.message : error.message}`);
    }
}

// API endpoint to handle teacher creation
app.post('/api/create-account-teacher', async (req, res) => {
    console.log('Request body received for teacher:', req.body);

    try {
        const { firstName, lastName, email } = req.body;

        if (!firstName || !lastName || !email) {
            console.log('Missing fields:', { firstName, lastName, email });
            return res.status(400).json({ error: 'Missing required fields: firstName, lastName, email' });
        }

        const result = await createContactInDynamics(req.body, 'contacts');
        res.status(201).json({ message: 'Teacher created successfully', data: result });
    } catch (error) {
        console.error('Error processing teacher creation:', error);
        res.status(500).json({ error: 'Failed to create teacher', details: error.message });
    }
});

// API endpoint to handle student creation
app.post('/api/create-account-student', async (req, res) => {
    console.log('Request body received for student:', req.body);

    try {
        const { firstName, lastName, new_type, gendercode, new_chronicdiseases, birthdate, new_nationalid, new_assignedinanoherschool, new_previousassignedschool, new_transferreason, new_ageatnexteducationalyear, academicYearId } = req.body;

        if (!firstName || !lastName || !new_type || !gendercode || !new_chronicdiseases || !birthdate || !new_nationalid || !new_assignedinanoherschool || !new_previousassignedschool || !new_transferreason || !new_ageatnexteducationalyear || !academicYearId) {
            console.log('Missing fields:', req.body);
            return res.status(400).json({ error: 'Missing required fields for student' });
        }

        // Create the student contact
        const result = await createContactInDynamics(req.body, 'contacts');

        // Update lookup fields for the student using the created student GUID
        const studentGuid = result.guid; // Get the GUID of the created student

        // Link the academic year to the student
        await updateLookupField('contacts', studentGuid, 'new_AcademicYearlookup', 'new_academicyears', academicYearId);

        // Link parents to the student
        if (parentGuids.father) {
            await updateLookupField('contacts', studentGuid, 'new_Father', 'contacts', parentGuids.father);
        }
        if (parentGuids.mother) {
            await updateLookupField('contacts', studentGuid, 'new_Mother', 'contacts', parentGuids.mother);
        }

        res.status(201).json({ message: 'Student created successfully', data: result });
    } catch (error) {
        console.error('Error processing student creation:', error);
        res.status(500).json({ error: 'Failed to create student', details: error.message });
    }
});

// API endpoint to handle parent creation
app.post('/api/create-account-parent', async (req, res) => {
    console.log('Request body received for parent:', req.body);

    try {
        const { firstName, lastName, email, telephone1, gendercode, familystatuscode, new_academicqualification, jobtitle, new_jobplace } = req.body;

        // Check for missing fields
        const missingFields = [];
        if (!firstName) missingFields.push('firstName');
        if (!lastName) missingFields.push('lastName');
        if (!email) missingFields.push('email');
        if (!telephone1) missingFields.push('telephone1');
        if (!gendercode) missingFields.push('gendercode');
        if (!familystatuscode) missingFields.push('familystatuscode');
        if (!new_academicqualification) missingFields.push('new_academicqualification');
        if (!jobtitle) missingFields.push('jobtitle');
        if (!new_jobplace) missingFields.push('new_jobplace');

        if (missingFields.length > 0) {
            console.log('Missing fields:', missingFields);
            return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
        }

        const result = await createContactInDynamics(req.body, 'contacts');

        // Store the GUID based on the gendercode (1 for father, 2 for mother)
        if (gendercode === '1') {
            parentGuids.father = result.guid;
        } else if (gendercode === '2') {
            parentGuids.mother = result.guid;
        }

        res.status(201).json({ message: 'Parent created successfully', data: result });
    } catch (error) {
        console.error('Error processing parent creation:', error);
        res.status(500).json({ error: 'Failed to create parent', details: error.message });
    }
});

// API endpoint to get academic years
app.get('/api/academic-years', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const fetchXml = `
            <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">
                <entity name="new_academicyear">
                    <attribute name="new_academicyearid" />
                    <attribute name="new_name" />
                    <order attribute="new_name" descending="false" />
                    <filter type="and">
                        <condition attribute="statecode" operator="eq" value="0" />
                    </filter>
                </entity>
            </fetch>
        `;

        const url = `${process.env.CRM_URL}/api/data/v9.0/new_academicyears?fetchXml=${encodeURIComponent(fetchXml)}`;

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Content-Type': 'application/json',
            },
        });

        const academicYears = response.data.value.map(year => ({
            id: year.new_academicyearid,
            name: year.new_name,
        }));

        res.status(200).json(academicYears);
    } catch (error) {
        console.error('Error fetching academic years:', error);
        res.status(500).json({ error: 'Failed to fetch academic years' });
    }
});

const PORT = process.env.PORT || 8080 ;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});