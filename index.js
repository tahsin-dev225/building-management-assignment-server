const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

//middleware 
app.use(cors({
    origin:['http://localhost:5173',"https://building-management-assignment.vercel.app"],
    credentials: true
}));
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.udxqu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

async function run() {
try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("buildingManagementAssignment").collection("users");
    const detailsCollection = client.db("buildingManagementAssignment").collection("apartmentDetails");
    const bookingCollection = client.db("buildingManagementAssignment").collection("bookings");
    const paymentCollection = client.db("buildingManagementAssignment").collection("payments");


    // jwt
    app.post('/jwt', async(req,res)=>{
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn : '1h'});
        res.send({token})
    })


    // middle weres 
    const verifyToken = (req,res,next) =>{
        // console.log("inside the token", req.headers)
        if(!req.headers.authorization){
            // console.log('eeerrr')
            return res.status(401).send({message : 'unauthorize access'})
        }
        // console.log('token payche')
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET , (err, decoded)=>{
            if(err){
                console.log('err')
                return res.status(401).send({message : 'unauthorize access'})
            }
            req.decoded = decoded;
            next();
        })
    }

    // verify admin after verify token
    const verifyAdmin = async(req,res, next)=>{
        const email = req.decoded.email;
        const query = {email : email};
        const user = await userCollection.findOne(query);
        const isAdmin = user?.role === 'admin';
        if(!isAdmin){
            return res.status(403).send({message: 'forbiden access'});
        }
        next();
    }

    // users releated api

    app.get('/users/admin/:email',verifyToken, async(req,res)=>{
        const email = req.params.email;
        if(email !== req.decoded.email){
            return res.status(403).send({message : 'forbiden access'})
        }
        const query = {email : email};
        const user = await userCollection.findOne(query);
        let admin = false;
        if(user){
            admin = user?.role === 'admin'
        }
        res.send({admin})
    })

    app.patch('/users/admin/:id', async (req,res)=>{
        const id = req.params.id;
        const filter = { _id : new ObjectId(id)};
        const updateDoc = {
            $set:{
                role: 'admin'
            }
        }
        const result = await userCollection.updateOne(filter , updateDoc)
        res.send(result)
    })

    app.post('/users', async (req,res)=>{
        const user = req.body;
        // console.log(user)
        const query = {email : user.email};
        const existingUser = await userCollection.findOne(query);
        if(existingUser){
            return res.send({messege: 'user already exist', insertedId:null})
        }
        const result = await userCollection.insertOne(user)
        res.send(result)
    })

    app.get('/users',verifyToken,verifyAdmin, async (req,res)=>{
        const result= await userCollection.find().toArray();
        res.send(result)
    })

    app.delete('/users/:id', async (req,res)=>{
        const id = req.params.id;
        const query = {_id : new ObjectId(id)};
        const result = await userCollection.deleteOne(query);
        res.send(result)
    })

    // bookings
    app.post('/bookings', async(req,res)=>{
        const booking = req.body;
        const result = await bookingCollection.insertOne(booking);
        res.send(result)
    })

    app.get('/bookings', async (req,res)=>{
        const email = req.query.email;
        const query = {email: email};
        const result = await bookingCollection.find(query).toArray();
        res.send(result)
    })

    app.delete('/bookings/:id', async(req,res)=>{
        const id = req.params.id;
        console.log(id)
        const query = { _id: new ObjectId(id) };
        const result = await bookingCollection.deleteOne(query);
        res.send(result)
      })

    // apartment and details

    app.patch('/apartmentDetails/:id', async (req,res)=>{
        const apartment = req.body;
        const id = req.params.id;
        const filter = { _id : new ObjectId(id)};
        const updateDoc = {
            $set : {
                location : apartment.location,
                category: apartment.category,
                map : apartment.map,
                price : apartment.price,
                description : apartment.description,
                image : apartment?.image
            }
        }
        const result = await detailsCollection.updateOne(filter, updateDoc);
        res.send(result)
    })

    app.delete('/apartmentDetails/:id', async (req,res)=>{
        const id = req.params.id;
        const query = { _id : new ObjectId(id)}
        const result = await detailsCollection.deleteOne(query);
        res.send(result)
    })

    app.get('/apartmentDetails/:id', async (req,res)=>{
        const id = req.params.id;
        // console.log(id)
        const query = { _id : new ObjectId(id)};
        const result = await detailsCollection.findOne(query);
        res.send(result)
    })

    app.get('/apartmentDetails', async (req,res)=>{
        // const query = req.params.id;
        const result = await detailsCollection.find().toArray();
        res.send(result)
    })

    app.post('/apartmentDetails', async (req,res)=>{
        const details = req.body;
        const result = await detailsCollection.insertOne(details);
        res.send(result)
    })

    // payment intent
    app.post('/create-payment-intent', async(req,res)=>{
        const {price } = req.body;
        const amount = parseInt( price * 100);
        console.log('amount ',amount);

        if(amount <= 0){
        //  res.status(400).send({message: 'minimu ano'})
            return 
        }
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: [
            "card"
            ]
        });
        res.send({
            clientSecret:  paymentIntent.client_secret
        });
    })

    app.post('/payments', async(req,res)=>{
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment);
  
        // carefully delete each item from the cart
        console.log('payment info', payment)
        const query = {_id: {
          $in: payment.bookingIds.map(id => new ObjectId(id))
        }};
  
        const deleteResult = await bookingCollection.deleteMany(query);
  
        res.send({ paymentResult, deleteResult });
      })

      app.get('/payments/:email',verifyToken , async (req,res)=>{
        const query = { email: req.params.email };
        if(req.params.email !== req.decoded.email){
          return res.status(403).send({message : 'forbidden access'})
        }
        const result = await paymentCollection.find(query).toArray();
        res.send(result)
      })

    //   stats and analysics
    app.get('/admin-stats', async(req,res)=>{
        const user = await userCollection.estimatedDocumentCount();
        const allApartments = await detailsCollection.estimatedDocumentCount();
        const orders = await paymentCollection.estimatedDocumentCount();

        const result = await paymentCollection.aggregate([
            {
                $group:{
                    _id:null,
                    totalRevenue:{
                        $sum:'$price'
                    }
                }
            }
        ]).toArray();

        const revenue = result.length > 0 ? result[0].totalRevenue : 0;
        res.send({
            user,
            allApartments,
            orders,
            revenue
        })
    })


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', ( req,res) =>{
    res.send('building management')
})

app.listen(port, ()=>{
    console.log(`port is running on ${port}`)
})