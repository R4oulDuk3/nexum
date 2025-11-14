# NodeIdResponseSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**node_id** | **str** | Current node ID | [optional] 
**status** | **str** | Response status | [optional] 

## Example

```python
from nexum-api-client.models.node_id_response_schema import NodeIdResponseSchema

# TODO update the JSON string below
json = "{}"
# create an instance of NodeIdResponseSchema from a JSON string
node_id_response_schema_instance = NodeIdResponseSchema.from_json(json)
# print the JSON string representation of the object
print NodeIdResponseSchema.to_json()

# convert the object into a dict
node_id_response_schema_dict = node_id_response_schema_instance.to_dict()
# create an instance of NodeIdResponseSchema from a dict
node_id_response_schema_form_dict = node_id_response_schema.from_dict(node_id_response_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


