const express = require("express");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const path = require("path");

const dbpath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;
const initializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeServerAndDatabase();

const convertStateTableDbToRequired = (list) => {
  return {
    stateId: list.state_id,
    stateName: list.state_name,
    population: list.population,
  };
};

const convertDistrictTableDbToRequired = (list) => {
  return {
    districtId: list.district_id,
    districtName: list.district_name,
    stateId: list.state_id,
    cases: list.cases,
    cured: list.cured,
    active: list.active,
    deaths: list.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//API (Register User in database)
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const searchUserQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';`;
  const searchUser = await db.get(searchUserQuery);
  if (searchUser === undefined) {
    //create a user row in table
    const createUserQuery = `
        INSERT INTO user(username, name, password, gender, location)
        VALUES('${username}', '${name}', '${hashedPassword}', '${gender}', '${location}');`;
    const createdUser = await db.run(createUserQuery);
    response.send("User Created Successfully");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//check login details
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const searchUserQuery = `
    SELECT * 
    FROM user 
    WHERE username = '${username}';`;
  const dbUser = await db.get(searchUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-1
app.get("/states/", authenticateToken, async (request, response) => {
  const getStateDetailsQuery = `
    SELECT 
        *
    FROM 
        state;`;
  const stateNames = await db.all(getStateDetailsQuery);
  response.send(
    stateNames.map((eachObj) => convertStateTableDbToRequired(eachObj))
  );
});

//API-2
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDetailsQuery = `
    SELECT 
        *
    FROM 
        state
    WHERE 
        state_id = ${stateId};`;
  const stateDetail = await db.get(getStateDetailsQuery);
  response.send(convertStateTableDbToRequired(stateDetail));
});

//API-3
app.post("/districts/", authenticateToken, async (request, response) => {
  const newDistrictDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = newDistrictDetails;
  const createDistrictDetails = `
    INSERT INTO 
        district(district_name,
                 state_id,
                 cases,
                 cured,
                 active,
                 deaths)
    VALUES('${districtName}',
            ${stateId},
            ${cases}, 
            ${cured},
            ${active}, 
            ${deaths});`;
  await db.run(createDistrictDetails);
  response.send("District Successfully Added");
});

//API-4
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDetailsQuery = `
    SELECT 
        *
    FROM 
        district
    WHERE 
        district_id = ${districtId};`;
    const districtDetail = await db.get(getDistrictDetailsQuery);
    response.send(convertDistrictTableDbToRequired(districtDetail));
  }
);

//API-5
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictDetailsQuery = `
    DELETE 
    FROM 
        district
    WHERE 
        district_id = ${districtId};`;
    await db.run(deleteDistrictDetailsQuery);
    response.send("District Removed");
  }
);

//API-6
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const newDistrictDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = newDistrictDetails;
    const updateDistrictDetails = `
    UPDATE 
        district
    SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases}, 
        cured = ${cured},
        active = ${active}, 
        deaths = ${deaths};
    WHERE
        district_id = ${districtId}`;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);

//API-7
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const reqStatusQuery = `
    SELECT 
        SUM(cases) AS totalCases,
        SUM(cured) AS totalCured,
        SUM(active) AS totalActive,
        SUM(deaths) AS totalDeaths
    FROM 
        district
    WHERE state_id = ${stateId};`;
    const reqStatus = await db.get(reqStatusQuery);
    response.send(reqStatus);
  }
);

module.exports = app;
