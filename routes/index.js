var express = require('express');
var router = express.Router();
const axios = require('axios')
const urljoin = require('url-join')
const xmlParser = require('fast-xml-parser')
const servercomm = require('../lib/servercomm')
const AdmZip = require('adm-zip')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Profile Exporter' });
});

router.post('/', function (req, res, next) {
  const { email, password } = req.body
  const server = 'https://core.sparkserver.eu/soapbox-race-core/Engine.svc'

  if (!email || !password) {
    res.status(422).send('lol try again')
    return
  }

  res.status(200)

  const authURL = urljoin(server, 'User/modernAuth');

  axios.default.post(authURL, {
    email,
    password
  }).then(function(response) {
    // console.log(response.data)
    const loginStatus = response.data
    const token = loginStatus.token
    const userId = loginStatus.userId

    // console.log(`loginToken = ${token}, userId = ${userId}`)

    return servercomm.sendServerPost(urljoin(server, 'User/GetPermanentSession'), token, userId).then(async function(response) {
      const sessionData = response.data
      const parsed = xmlParser.parse(sessionData)

      const newToken = parsed.UserInfo.user.securityToken

      let personas = parsed.UserInfo.personas.ProfileData
      if (!(personas instanceof Array)) {
        personas = [personas]
      }

      const zip = new AdmZip();
      zip.addFile("personas/", Buffer.from(new Uint8Array(0)))
      zip.addFile("DriverPersona/", Buffer.from(new Uint8Array(0)))
      zip.addFile("User/GetPermanentSession.xml", Buffer.from(sessionData, 'utf8'))

      for (let persona of personas) {
        zip.addFile(`personas/${persona.PersonaId}/`, Buffer.from(new Uint8Array(0)))

        await servercomm.sendServerPost(urljoin(server, 'User/SecureLoginPersona?personaId=' + persona.PersonaId), newToken, userId)

        const carsResponse = (await servercomm.sendServerGet(urljoin(server, `personas/${persona.PersonaId}/cars`), newToken, userId)).data
        const carslotsResponse = (await servercomm.sendServerGet(urljoin(server, `personas/${persona.PersonaId}/carslots`), newToken, userId)).data
        const defcarResponse = (await servercomm.sendServerGet(urljoin(server, `personas/${persona.PersonaId}/defaultcar`), newToken, userId)).data
        const objectsResponse = (await servercomm.sendServerGet(urljoin(server, `personas/inventory/objects`), newToken, userId)).data
        const pInfoResponse = (await servercomm.sendServerGet(urljoin(server, `DriverPersona/GetPersonaInfo?personaId=${persona.PersonaId}`), newToken, userId)).data
        const pBaseResponse = (await servercomm.sendServerPost(urljoin(server, `DriverPersona/GetPersonaBaseFromList`), newToken, userId, `<PersonaIdArray><PersonaIds><long>${persona.PersonaId}</long></PersonaIds></PersonaIdArray>`)).data

        zip.addFile(`personas/${persona.PersonaId}/cars.xml`, Buffer.from(carsResponse, 'utf8'))
        zip.addFile(`personas/${persona.PersonaId}/carslots.xml`, Buffer.from(carslotsResponse, 'utf8'))
        zip.addFile(`personas/${persona.PersonaId}/defaultcar.xml`, Buffer.from(defcarResponse, 'utf8'))
        zip.addFile(`personas/${persona.PersonaId}/objects.xml`, Buffer.from(objectsResponse, 'utf8'))
        zip.addFile(`DriverPersona/GetPersonaInfo_${persona.PersonaId}.xml`, Buffer.from(pInfoResponse, 'utf8'))
        zip.addFile(`DriverPersona/GetPersonaBaseFromList_${persona.PersonaId}.xml`, Buffer.from(pBaseResponse, 'utf8'))
      }

      res.status(200).send(zip.toBuffer())
    }).catch(function (error) {
      console.log(error.response ? error.response : error, error.response ? `${error.response.data} [${error.response.status}]` : "")

      res.status(500).send("Cannot establish session")
    })
  }).catch(function (error) {
    console.log(error.message, error.response ? error.response.data : "")

    const loginStatus = error.response.data

    res.status(500).send(loginStatus.error)
  })
})

module.exports = router;
